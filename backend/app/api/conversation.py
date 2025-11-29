from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Session as SessionModel, Conversation, Document, AudioRecording
from app.models.conversation import MessageRole, MessageType
from app.schemas.conversation import MessageRequest, MessageResponse, ConversationHistory
from app.services.openai_service import openai_service
from app.services.journal_service import JournalService
from app.services.s3_service import s3_service
from app.api.auth import get_current_user
from app.api.permissions import check_session_access
from typing import Optional
from datetime import datetime, date as date_type
import uuid
import logging
import io
import tempfile
import os
from pydub import AudioSegment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversation", tags=["conversation"])


@router.post("/message", response_model=dict)
async def send_message(
    content: str,
    session_id: str,
    message_type: str = "text",
    document_id: Optional[int] = None,
    media_url: Optional[str] = None,
    entry_date: Optional[str] = None,  # User's local date (YYYY-MM-DD)
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message in the conversation (with optional rich media)"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    try:
        # Get extracted text and media URL if document/image message
        extracted_text = None
        generated_media_url = None

        if document_id:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                extracted_text = doc.extracted_text
                # Generate presigned URL for documents and images (for native GPT-5.1 file support)
                generated_media_url = s3_service.generate_presigned_url(doc.s3_key, expiration=86400)  # 24 hours

        # Create user message
        user_message = Conversation(
            session_id=session_id,
            role=MessageRole.USER,
            content=content,
            message_type=MessageType(message_type),
            document_id=document_id,
            media_url=generated_media_url or media_url,
            extracted_text=extracted_text
        )
        db.add(user_message)
        db.commit()
        db.refresh(user_message)

        # Get conversation history for context
        history = db.query(Conversation).filter(
            Conversation.session_id == session_id
        ).order_by(Conversation.created_at).limit(20).all()

        history_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in history[:-1]  # Exclude the message we just added
        ]

        # Get journal context
        journal_service = JournalService(db)
        journal_context = await journal_service.format_journal_context(session_id)

        # Build complete message with extracted text for journal synthesis
        complete_message = content
        if extracted_text:
            complete_message = f"{content}\n\n[Document content]:\n{extracted_text}"

        # Get AI response with journal context and native file/image support
        ai_response_text = await openai_service.chat_with_journal(
            message=content,  # Don't include extracted text - use native file support
            conversation_history=history_messages,
            journal_context=journal_context,
            document_url=generated_media_url if document_id else None,
            document_type=message_type if document_id else None
        )

        # Create assistant message
        assistant_message = Conversation(
            session_id=session_id,
            role=MessageRole.ASSISTANT,
            content=ai_response_text,
            message_type=MessageType.TEXT
        )
        db.add(assistant_message)
        db.commit()
        db.refresh(assistant_message)

        # Parse user's local date if provided, otherwise use server date
        user_date = None
        if entry_date:
            try:
                user_date = date_type.fromisoformat(entry_date)
            except ValueError:
                logger.warning(f"Invalid entry_date format: {entry_date}, using server date")

        # Assess for journal synthesis (include document content)
        synthesis_result = await journal_service.assess_and_synthesize(
            user_message=complete_message,
            ai_response=ai_response_text,
            session_id=session_id,
            conversation_id=user_message.id,
            entry_date=user_date
        )

        # Mark messages as synthesized if entries were created
        if synthesis_result.should_create and len(synthesis_result.suggested_entries) > 0:
            user_message.synthesized_to_journal = True
            assistant_message.synthesized_to_journal = True
            db.commit()

        return {
            "message": {
                "id": assistant_message.id,
                "role": assistant_message.role.value,
                "content": assistant_message.content,
                "created_at": assistant_message.created_at.isoformat()
            },
            "journal_suggestion": {
                "should_create": synthesis_result.should_create,
                "reasoning": synthesis_result.reasoning,
                "entries": [
                    {
                        "title": entry.title,
                        "content": entry.content,
                        "entry_type": entry.entry_type.value,
                        "confidence": entry.confidence
                    }
                    for entry in synthesis_result.suggested_entries
                ]
            } if synthesis_result.should_create else None
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error processing message: {str(e)}")


@router.get("/{session_id}/history", response_model=ConversationHistory)
async def get_conversation_history(
    session_id: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get conversation history with rich media"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    # Get messages
    messages = db.query(Conversation).filter(
        Conversation.session_id == session_id
    ).order_by(Conversation.created_at).limit(limit).all()

    # Convert to response format (including rich media fields)
    message_responses = []
    for msg in messages:
        # Regenerate presigned URL for images (they expire after 24h)
        media_url = msg.media_url
        if msg.message_type == MessageType.IMAGE and msg.document_id:
            doc = db.query(Document).filter(Document.id == msg.document_id).first()
            if doc:
                media_url = s3_service.generate_presigned_url(doc.s3_key, expiration=86400)

        msg_dict = {
            "id": msg.id,
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at,
            "message_type": msg.message_type,
            "document_id": msg.document_id,
            "media_url": media_url,
            "extracted_text": msg.extracted_text
        }
        message_responses.append(MessageResponse(**msg_dict))

    return {"messages": message_responses}


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Transcribe audio file to text using OpenAI's speech-to-text"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    try:
        # Validate audio file type
        allowed_types = ['audio/mpeg', 'audio/mp4', 'audio/mpeg', 'audio/mpga', 'audio/m4a', 'audio/wav', 'audio/webm']
        allowed_extensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm']

        file_ext = '.' + audio.filename.split('.')[-1].lower() if '.' in audio.filename else ''
        if file_ext not in allowed_extensions and audio.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid audio format. Supported formats: {', '.join(allowed_extensions)}"
            )

        # Generate unique filename for S3
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        s3_key = f"audio/{session_id}/{timestamp}_{unique_id}_{audio.filename}"

        # Read audio file content
        audio_content = await audio.read()

        # Upload original to S3
        await s3_service.upload_file(audio_content, s3_key, audio.content_type or 'audio/mpeg')
        logger.info(f"Uploaded audio to S3: {s3_key}")

        # Convert audio to mp3 for OpenAI using temporary files
        audio_temp_path = None
        mp3_temp_path = None
        try:
            # Debug: Check audio content
            logger.info(f"Audio content size: {len(audio_content)} bytes")
            logger.info(f"First 20 bytes: {audio_content[:20].hex() if len(audio_content) >= 20 else audio_content.hex()}")

            # Write audio content to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm', mode='wb') as audio_temp:
                bytes_written = audio_temp.write(audio_content)
                audio_temp.flush()  # Ensure data is written to disk
                os.fsync(audio_temp.fileno())  # Force write to disk
                audio_temp_path = audio_temp.name
                logger.info(f"Wrote {bytes_written} bytes to {audio_temp_path}")

            # Verify file was written correctly
            with open(audio_temp_path, 'rb') as verify:
                file_size = os.path.getsize(audio_temp_path)
                first_bytes = verify.read(20)
                logger.info(f"Verified file size: {file_size} bytes, first 20 bytes: {first_bytes.hex()}")

            # Create temporary file for mp3 output
            mp3_temp_fd, mp3_temp_path = tempfile.mkstemp(suffix='.mp3')
            os.close(mp3_temp_fd)  # Close file descriptor, pydub will open it

            # Convert to mp3 (auto-detect input format)
            audio_segment = AudioSegment.from_file(audio_temp_path)
            duration_seconds = len(audio_segment) / 1000.0  # pydub returns milliseconds
            audio_segment.export(mp3_temp_path, format="mp3")

            # Read mp3 file into BytesIO for OpenAI
            with open(mp3_temp_path, 'rb') as mp3_file:
                mp3_buffer = io.BytesIO(mp3_file.read())
                mp3_buffer.seek(0)

            # Use mp3 filename for transcription
            mp3_filename = audio.filename.rsplit('.', 1)[0] + '.mp3'
            transcribed_text = await openai_service.transcribe_audio(mp3_buffer, mp3_filename)
        except Exception as e:
            logger.error(f"Error converting audio to mp3: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error processing audio file: {str(e)}")
        finally:
            # Clean up temporary files
            if audio_temp_path and os.path.exists(audio_temp_path):
                os.unlink(audio_temp_path)
            if mp3_temp_path and os.path.exists(mp3_temp_path):
                os.unlink(mp3_temp_path)

        if not transcribed_text:
            raise HTTPException(status_code=500, detail="Failed to transcribe audio")

        logger.info(f"Successfully transcribed audio for session {session_id}")

        # Use AI to categorize recording and generate summary
        # Wrapped in try/except for backward compatibility - if AI fails, recording still saves
        recording_category = None
        ai_summary = None
        try:
            categorization = await openai_service.categorize_audio_recording(
                transcribed_text or "",
                duration_seconds
            )
            # Convert category string to enum (with fallback to OTHER)
            try:
                from app.models import AudioRecordingCategory
                recording_category = AudioRecordingCategory(categorization["category"])
            except (ValueError, KeyError):
                recording_category = AudioRecordingCategory.OTHER
            ai_summary = categorization.get("summary", "")
        except Exception as e:
            logger.warning(f"AI categorization failed for audio recording: {e}. Recording will save without category.")
            # Leave recording_category and ai_summary as None for backward compatibility

        # Save audio recording metadata to database with AI metadata (or None if AI failed)
        audio_recording = AudioRecording(
            session_id=session_id,
            filename=audio.filename,
            s3_key=s3_key,
            duration=duration_seconds,
            transcribed_text=transcribed_text,
            category=recording_category,
            ai_summary=ai_summary
        )
        db.add(audio_recording)
        db.commit()
        db.refresh(audio_recording)

        logger.info(f"Saved audio recording metadata to database: ID {audio_recording.id}")

        return {
            "transcribed_text": transcribed_text,
            "audio_s3_key": s3_key,
            "filename": audio.filename,
            "recording_id": audio_recording.id,
            "duration": duration_seconds
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error transcribing audio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error transcribing audio: {str(e)}")
