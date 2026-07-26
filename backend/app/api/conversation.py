from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Integer
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from app.core.database import get_db
from app.core.rate_limit import limiter, RateLimits
from app.core.upload import read_upload_with_limit
from app.models import User, Session as SessionModel, Conversation, Document, AudioRecording
from app.models.conversation import MessageRole, MessageType
from app.models.journal import JournalEntry
from app.schemas.conversation import MessageRequest, MessageResponse, ConversationHistory, UpdateMessageRequest, UpdateMessageResponse
from app.services.openai_service import openai_service, ImageProcessingError
from app.services.journal_service import JournalService
from app.services.s3_service import s3_service
from app.services.security_service import SecurityService
from app.api.auth import get_current_user
from app.api.permissions import check_session_access
from app.api.source_tags import session_has_collaborators, build_source_tag_info, get_user_map
from typing import Optional
from datetime import datetime, date as date_type, timedelta
import uuid
import logging
import io
import tempfile
import os
import shutil
import subprocess
import asyncio

logger = logging.getLogger(__name__)


# Audio processing helpers. These shell out to ffmpeg/ffprobe working on temp
# files, so peak memory stays flat regardless of recording length. (The
# previous pydub pipeline decoded the entire file to raw PCM in RAM — 1-2 GB
# for a multi-hour recording — which OOM-killed the container.) All are
# blocking and must run via asyncio.to_thread.
def _probe_audio_duration(audio_path: str) -> Optional[float]:
    """Duration in seconds from container metadata, without decoding.

    Returns None when the container doesn't report one (e.g. streamed
    MediaRecorder webm) or the file is unreadable — callers fall back to
    probing the transcoded MP3, which always has a duration.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return None
        return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError):
        return None


def _transcode_to_mp3(input_path: str, output_path: str):
    """Transcode any supported audio container to 128 kbps MP3 on disk."""
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", input_path,
            "-vn", "-acodec", "libmp3lame", "-b:a", "128k",
            output_path,
        ],
        capture_output=True, text=True, timeout=900,
    )
    if result.returncode != 0:
        raise ValueError(f"ffmpeg transcode failed: {result.stderr.strip()[:500]}")


def _segment_mp3(input_path: str, output_dir: str, segment_seconds: int) -> list:
    """Split an MP3 into ~segment_seconds pieces without re-encoding.

    Uses the ffmpeg segment muxer with stream copy — MP3 frames are
    independently decodable, so cutting at frame boundaries is safe and the
    pass is I/O-bound.
    """
    pattern = os.path.join(output_dir, "chunk_%04d.mp3")
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-i", input_path,
            "-f", "segment", "-segment_time", str(segment_seconds),
            "-c", "copy", pattern,
        ],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise ValueError(f"ffmpeg segmentation failed: {result.stderr.strip()[:500]}")
    return sorted(
        os.path.join(output_dir, name)
        for name in os.listdir(output_dir)
        if name.startswith("chunk_") and name.endswith(".mp3")
    )


def _calculate_usage_patterns(db: Session, session_id: str) -> dict:
    """Calculate usage patterns for the current session"""
    now = datetime.utcnow()

    # Calculate time ranges
    one_day_ago = now - timedelta(days=1)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # Count conversations in each time period
    conversations_1d = db.query(func.count(Conversation.id)).filter(
        Conversation.session_id == session_id,
        Conversation.created_at >= one_day_ago
    ).scalar() or 0

    conversations_7d = db.query(func.count(Conversation.id)).filter(
        Conversation.session_id == session_id,
        Conversation.created_at >= seven_days_ago
    ).scalar() or 0

    conversations_30d = db.query(func.count(Conversation.id)).filter(
        Conversation.session_id == session_id,
        Conversation.created_at >= thirty_days_ago
    ).scalar() or 0

    # Count journal entries in each time period
    journal_1d = db.query(func.count(JournalEntry.id)).filter(
        JournalEntry.session_id == session_id,
        JournalEntry.created_at >= one_day_ago
    ).scalar() or 0

    journal_7d = db.query(func.count(JournalEntry.id)).filter(
        JournalEntry.session_id == session_id,
        JournalEntry.created_at >= seven_days_ago
    ).scalar() or 0

    journal_30d = db.query(func.count(JournalEntry.id)).filter(
        JournalEntry.session_id == session_id,
        JournalEntry.created_at >= thirty_days_ago
    ).scalar() or 0

    return {
        "conversations_1d": conversations_1d,
        "conversations_7d": conversations_7d,
        "conversations_30d": conversations_30d,
        "journal_entries_1d": journal_1d,
        "journal_entries_7d": journal_7d,
        "journal_entries_30d": journal_30d
    }

router = APIRouter(prefix="/conversation", tags=["conversation"])


@router.post("/message", response_model=dict)
@limiter.limit(RateLimits.AI_CHAT)
async def send_message(
    request: Request,
    message_request: MessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message in the conversation (with optional rich media)"""
    # Extract parameters from request model
    content = message_request.content
    session_id = message_request.session_id
    message_type = message_request.message_type
    document_id = message_request.document_id
    audio_recording_id = message_request.audio_recording_id
    media_url = message_request.media_url
    entry_date = message_request.entry_date
    user_timezone = message_request.user_timezone
    current_time = message_request.current_time

    # Verify user has access to session (owner or collaborator)
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    try:
        # Get extracted text, media URL, and content type if document/image message
        extracted_text = None
        generated_media_url = None
        doc_content_type = None

        if document_id:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                extracted_text = doc.extracted_text
                doc_content_type = doc.content_type
                # Generate presigned URL for documents and images (for native GPT-5.6 file support)
                generated_media_url = s3_service.generate_presigned_url(doc.s3_key)  # 15 minutes (default)

        # Create user message
        user_message = Conversation(
            session_id=session_id,
            role=MessageRole.USER,
            content=content,
            message_type=MessageType(message_type),
            document_id=document_id,
            audio_recording_id=audio_recording_id,
            media_url=generated_media_url or media_url,
            extracted_text=extracted_text,
            created_by_user_id=current_user.id  # Track creator for collaborative sessions
        )
        db.add(user_message)
        db.commit()
        db.refresh(user_message)

        # Get conversation history for context (most recent 30 messages)
        history = db.query(Conversation).filter(
            Conversation.session_id == session_id
        ).order_by(Conversation.created_at.desc()).limit(30).all()[::-1]

        history_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in history[:-1]  # Exclude the message we just added
        ]

        # Get journal context (older, recent, and semantically relevant)
        journal_service = JournalService(db)
        older_journal, recent_journal, relevant_journal = await journal_service.format_journal_context_with_semantic(
            session_id, user_message=content
        )

        # Build complete message with extracted text for journal synthesis
        complete_message = content
        if extracted_text:
            complete_message = f"{content}\n\n[Document content]:\n{extracted_text}"

        # Calculate usage patterns for user context
        usage_patterns = _calculate_usage_patterns(db, session_id)

        # Get AI response with journal context, usage metadata, and native file/image support
        ai_response_text = await openai_service.chat_with_journal(
            message=content,  # Don't include extracted text - use native file support for PDFs
            conversation_history=history_messages,
            older_journal_context=older_journal,
            recent_journal_context=recent_journal,
            relevant_journal_context=relevant_journal,
            document_url=generated_media_url if document_id else None,
            document_type=message_type if document_id else None,
            content_type=doc_content_type,
            extracted_text=extracted_text,
            user_timezone=user_timezone,
            current_time=current_time,
            usage_patterns=usage_patterns,
            user_id=current_user.id
        )

        # --- Begin atomic zone: assistant message + journal entries + synthesis flag ---
        # All DB writes after the AI call are flushed (not committed) until the end,
        # so they either all persist or all roll back on failure.

        # Create assistant message
        assistant_message = Conversation(
            session_id=session_id,
            role=MessageRole.ASSISTANT,
            content=ai_response_text,
            message_type=MessageType.TEXT
        )
        db.add(assistant_message)
        db.flush()  # Get ID without committing

        # Parse user's local date if provided, otherwise use server date
        user_date = None
        if entry_date:
            try:
                user_date = date_type.fromisoformat(entry_date)
            except ValueError:
                logger.warning(f"Invalid entry_date format: {entry_date}, using server date")

        # Use comprehensive document synthesis if a document was uploaded
        # Otherwise use conversational synthesis (auto_commit=False defers commit)
        if document_id:
            # Get document details for comprehensive synthesis
            doc = db.query(Document).filter(Document.id == document_id).first()
            try:
                synthesis_result = await journal_service.synthesize_from_document(
                    filename=doc.filename if doc else "Unknown document",
                    ai_description=doc.ai_description if (doc and doc.ai_description) else "",
                    session_id=session_id,
                    document_url=generated_media_url,  # Use presigned URL for native file support
                    content_type=doc.content_type if doc else None,
                    extracted_text=extracted_text or "",  # Fallback only if URL unavailable
                    entry_date=user_date,
                    document_id=document_id,
                    user_id=current_user.id,
                    auto_commit=False
                )
            except Exception as synth_err:
                logger.error(f"Document synthesis failed, continuing without journal entries: {synth_err}", exc_info=True)
                try:
                    from app.services.error_logger import log_database_error
                    log_database_error(
                        db=db,
                        source="api.conversation.send_message.document_synthesis",
                        error=synth_err,
                        user_id=current_user.id,
                        session_id=session_id,
                        details={"document_id": document_id}
                    )
                except Exception:
                    pass
                from app.schemas.journal import JournalSynthesisResult
                synthesis_result = JournalSynthesisResult(
                    should_create=False,
                    reasoning="Synthesis temporarily unavailable",
                    suggested_entries=[],
                    warning="The document could not be fully analyzed for journal entries. Your AI response has been saved. You can re-upload the document to retry."
                )
        else:
            # Regular conversational synthesis
            synthesis_result = await journal_service.assess_and_synthesize(
                user_message=complete_message,
                ai_response=ai_response_text,
                session_id=session_id,
                conversation_id=user_message.id,
                entry_date=user_date,
                audio_recording_id=user_message.audio_recording_id,
                user_id=current_user.id,
                auto_commit=False
            )

        # Mark messages as synthesized if entries were created
        if synthesis_result.should_create and len(synthesis_result.suggested_entries) > 0:
            # Use raw SQL to update without triggering onupdate on updated_at
            # Explicitly preserve updated_at as NULL for new messages
            from sqlalchemy import text
            db.execute(
                text("""
                    UPDATE conversations
                    SET synthesized_to_journal = true, updated_at = NULL
                    WHERE id IN (:user_id, :assistant_id)
                """),
                {"user_id": user_message.id, "assistant_id": assistant_message.id}
            )

        # Commit everything atomically: assistant message + journal entries + synthesis flag
        db.commit()
        db.refresh(user_message)
        db.refresh(assistant_message)
        # --- End atomic zone ---

        # Push notification for shared sessions (non-blocking, fire-and-forget)
        try:
            from app.models import SessionCollaborator
            collaborators = db.query(SessionCollaborator.user_id).filter(
                SessionCollaborator.session_id == session_id
            ).all()
            if collaborators:
                all_participant_ids = [c.user_id for c in collaborators] + [session.owner_id]
                from app.services.push_notification_service import PushNotificationService
                PushNotificationService.notify_new_message(
                    session_id=session_id,
                    session_name=session.name,
                    sender_user_id=current_user.id,
                    collaborator_user_ids=all_participant_ids,
                )
        except Exception as push_err:
            logger.warning(f"Push notification failed (non-fatal): {push_err}")

        # Deferred embeddings for journal entries created during synthesis.
        # Runs after commit so entries are persisted regardless of embedding success.
        if synthesis_result.created_entries:
            from app.services.embedding_service import EmbeddingService
            embedding_service = EmbeddingService(db)
            for created_entry in synthesis_result.created_entries:
                try:
                    await embedding_service.embed_journal_entry(created_entry)
                except Exception as embed_err:
                    logger.warning(f"Deferred embedding failed for entry {created_entry.id}: {embed_err}")

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
                ],
                "warning": synthesis_result.warning
            } if synthesis_result.should_create else None,
            "processing_warning": synthesis_result.warning if synthesis_result and synthesis_result.warning else None
        }

    except ImageProcessingError as e:
        db.rollback()
        # Return a user-friendly error for image processing issues
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        db.rollback()

        # Log error to database for admin visibility
        try:
            from app.services.error_logger import log_database_error
            log_database_error(
                db=db,
                source="api.conversation.send_message",
                error=e,
                user_id=current_user.id,
                session_id=session_id,
                details={
                    "message_length": len(content) if content else 0,
                    "has_document": document_id is not None
                }
            )
        except Exception as log_error:
            logger.error(f"Failed to log error to database: {log_error}")

        raise HTTPException(status_code=500, detail="Error processing message. Please try again.")


@router.get("/{session_id}/history", response_model=ConversationHistory)
async def get_conversation_history(
    session_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    before_id: int = Query(None, description="Cursor: return messages with id < this value (preferred over offset for deep pagination)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get conversation history with rich media and pagination"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    # Get total message count for pagination
    total_count = db.query(Conversation).filter(
        Conversation.session_id == session_id
    ).count()

    # Build query — use cursor (before_id) when provided for O(1) pagination,
    # fall back to OFFSET for backward compatibility
    query = db.query(Conversation).filter(Conversation.session_id == session_id)
    if before_id is not None:
        query = query.filter(Conversation.id < before_id)
    query = query.order_by(Conversation.id.desc()).limit(limit)
    if before_id is None:
        query = query.offset(offset)
    messages = query.all()
    # Reverse to get chronological order for display
    messages = list(reversed(messages))

    # Batch load all documents for image and document messages in ONE query (fixes N+1)
    doc_ids = [
        msg.document_id for msg in messages
        if msg.document_id and msg.message_type in [MessageType.IMAGE, MessageType.DOCUMENT]
    ]
    docs_by_id = {}
    if doc_ids:
        docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
        docs_by_id = {doc.id: doc for doc in docs}

    # Check if session has collaborators (for source tag attribution)
    has_collaborators = session_has_collaborators(session_id, db)

    # Batch load user info for source tags if session has collaborators
    user_map = {}
    if has_collaborators:
        user_ids = []
        for msg in messages:
            if msg.created_by_user_id:
                user_ids.append(msg.created_by_user_id)
            if msg.last_edited_by_user_id:
                user_ids.append(msg.last_edited_by_user_id)
        user_map = get_user_map(user_ids, db)

    # Convert to response format (including rich media fields)
    message_responses = []
    for msg in messages:
        # Regenerate presigned URLs for images (30 min) and thumbnails (6 hours)
        media_url = msg.media_url
        thumbnail_url = None

        if msg.document_id:
            doc = docs_by_id.get(msg.document_id)
            if doc:
                if msg.message_type == MessageType.IMAGE:
                    # For images, regenerate the image URL (30 min)
                    media_url = s3_service.generate_presigned_url(doc.s3_key)
                elif msg.message_type == MessageType.DOCUMENT and doc.thumbnail_s3_key:
                    # For document thumbnails (PDFs), generate thumbnail URL (6 hours)
                    thumbnail_url = s3_service.generate_presigned_url(doc.thumbnail_s3_key, expiration=21600)

        msg_dict = {
            "id": msg.id,
            "session_id": msg.session_id,
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at,
            "updated_at": msg.updated_at,
            "message_type": msg.message_type,
            "document_id": msg.document_id,
            "media_url": media_url,
            "thumbnail_url": thumbnail_url,
            "extracted_text": msg.extracted_text,
            # Source tags only when session has collaborators
            "created_by": build_source_tag_info(user_map.get(msg.created_by_user_id)) if has_collaborators and msg.created_by_user_id else None,
            "last_edited_by": build_source_tag_info(user_map.get(msg.last_edited_by_user_id)) if has_collaborators and msg.last_edited_by_user_id else None
        }
        message_responses.append(MessageResponse(**msg_dict))

    # Calculate if there are more (older) messages to load
    if before_id is not None:
        # Cursor mode: check if there are messages with IDs lower than our oldest result
        if messages:
            oldest_returned_id = messages[0].id
            has_more = db.query(Conversation).filter(
                Conversation.session_id == session_id,
                Conversation.id < oldest_returned_id
            ).limit(1).count() > 0
        else:
            has_more = False
    else:
        has_more = (offset + limit) < total_count

    return {"messages": message_responses, "total_count": total_count, "has_more": has_more}


@router.patch("/{message_id}", response_model=UpdateMessageResponse)
async def update_message(
    message_id: int,
    update_data: UpdateMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a user message in the conversation"""
    # Get the message
    message = db.query(Conversation).filter(Conversation.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Verify message is from a user (not assistant)
    if message.role != MessageRole.USER:
        raise HTTPException(status_code=400, detail="Only user messages can be edited")

    # Verify user has access to session (owner or collaborator)
    session = db.query(SessionModel).filter(SessionModel.id == message.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    # Update message content
    message.content = update_data.content
    message.updated_at = datetime.utcnow()
    message.last_edited_by_user_id = current_user.id  # Track editor for collaborative sessions

    db.commit()
    db.refresh(message)

    # Build source tag for editor if session has collaborators
    has_collaborators = session_has_collaborators(message.session_id, db)
    last_edited_by = build_source_tag_info(current_user) if has_collaborators else None

    return UpdateMessageResponse(
        id=message.id,
        content=message.content,
        updated_at=message.updated_at,
        last_edited_by=last_edited_by
    )


@router.post("/{message_id}/reset", response_model=dict)
async def reset_to_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reset conversation to a specific message, deleting everything after it.

    Deletes all messages after the specified message, along with any documents,
    audio recordings, and journal entries associated with deleted messages.
    """
    # Get the anchor message
    message = db.query(Conversation).filter(Conversation.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Verify user has access to session
    session = db.query(SessionModel).filter(SessionModel.id == message.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    session_id = message.session_id

    try:
        # Find all messages after the anchor message
        messages_to_delete = db.query(Conversation).filter(
            Conversation.session_id == session_id,
            Conversation.id > message_id
        ).all()

        if not messages_to_delete:
            return {
                "deleted_messages": 0,
                "deleted_documents": 0,
                "deleted_audio": 0,
                "deleted_journal_entries": 0
            }

        deleted_message_ids = [m.id for m in messages_to_delete]

        # Collect linked document and audio IDs
        document_ids = list(set(
            m.document_id for m in messages_to_delete if m.document_id is not None
        ))
        audio_ids = list(set(
            m.audio_recording_id for m in messages_to_delete if m.audio_recording_id is not None
        ))

        # Delete journal entries synthesized from deleted messages.
        # An entry can match multiple criteria (e.g. source_message_ids AND
        # source_document_id), so track deleted IDs to avoid double-delete.
        deleted_journal_ids: set = set()

        # Journal entries linked via source_message_ids (array overlap)
        if deleted_message_ids:
            journal_from_messages = db.query(JournalEntry).filter(
                JournalEntry.session_id == session_id,
                cast(JournalEntry.source_message_ids, PG_ARRAY(Integer)).overlap(deleted_message_ids)
            ).all()
            for entry in journal_from_messages:
                deleted_journal_ids.add(entry.id)
                db.delete(entry)

        # Journal entries linked via source_document_id
        if document_ids:
            journal_from_docs = db.query(JournalEntry).filter(
                JournalEntry.source_document_id.in_(document_ids),
                ~JournalEntry.id.in_(deleted_journal_ids) if deleted_journal_ids else True
            ).all()
            for entry in journal_from_docs:
                deleted_journal_ids.add(entry.id)
                db.delete(entry)

        # Journal entries linked via source_audio_id
        if audio_ids:
            journal_from_audio = db.query(JournalEntry).filter(
                JournalEntry.source_audio_id.in_(audio_ids),
                ~JournalEntry.id.in_(deleted_journal_ids) if deleted_journal_ids else True
            ).all()
            for entry in journal_from_audio:
                deleted_journal_ids.add(entry.id)
                db.delete(entry)

        journal_count = len(deleted_journal_ids)

        # Flush journal deletes before removing documents/audio, because
        # documents and audio have ondelete=CASCADE on the journal FK.
        # Without this flush, the cascade removes the row first, and then
        # SQLAlchemy's pending db.delete() finds 0 rows, triggering a
        # SAWarning about mismatched row counts.
        if deleted_journal_ids:
            db.flush()

        # Delete S3 files for documents (non-fatal)
        if document_ids:
            documents = db.query(Document).filter(Document.id.in_(document_ids)).all()
            for doc in documents:
                try:
                    await s3_service.delete_file(doc.s3_key)
                    if doc.thumbnail_s3_key:
                        await s3_service.delete_file(doc.thumbnail_s3_key)
                except Exception as e:
                    logger.warning(f"Failed to delete S3 file for document {doc.id}: {e}")

            # Delete documents from DB
            db.query(Document).filter(Document.id.in_(document_ids)).delete(synchronize_session=False)

        # Delete S3 files for audio recordings (non-fatal)
        if audio_ids:
            recordings = db.query(AudioRecording).filter(AudioRecording.id.in_(audio_ids)).all()
            for rec in recordings:
                try:
                    await s3_service.delete_file(rec.s3_key)
                except Exception as e:
                    logger.warning(f"Failed to delete S3 file for audio {rec.id}: {e}")

            # Delete audio recordings from DB
            db.query(AudioRecording).filter(AudioRecording.id.in_(audio_ids)).delete(synchronize_session=False)

        # Delete the conversation messages
        db.query(Conversation).filter(
            Conversation.id.in_(deleted_message_ids)
        ).delete(synchronize_session=False)

        db.commit()

        logger.info(
            f"Conversation reset for session {session_id}: "
            f"{len(deleted_message_ids)} messages, {len(document_ids)} docs, "
            f"{len(audio_ids)} audio, {journal_count} journal entries deleted"
        )

        return {
            "deleted_messages": len(deleted_message_ids),
            "deleted_documents": len(document_ids),
            "deleted_audio": len(audio_ids),
            "deleted_journal_entries": journal_count
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error resetting conversation: {e}", exc_info=True)

        try:
            from app.services.error_logger import log_database_error
            log_database_error(
                db=db,
                source="api.conversation.reset_to_message",
                error=e,
                user_id=current_user.id,
                session_id=session_id,
                details={"message_id": message_id}
            )
        except Exception:
            pass

        raise HTTPException(status_code=500, detail="Error resetting conversation. Please try again.")


MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024  # 100MB for audio transcription

# Byte size is a poor proxy for processing cost — 100MB of low-bitrate audio
# can be many hours long. The duration cap bounds transcription time/cost and
# temp-file disk usage.
MAX_AUDIO_DURATION_SECONDS = 4 * 60 * 60  # 4 hours

# OpenAI's transcription API rejects requests over ~1400 seconds of audio
MAX_CHUNK_DURATION_SECONDS = 1200  # 20 minutes (safely under the limit)


def _audio_too_long_error(duration_seconds: float) -> HTTPException:
    hours = duration_seconds / 3600
    max_hours = MAX_AUDIO_DURATION_SECONDS / 3600
    return HTTPException(
        status_code=400,
        detail=(
            f"Audio recording is too long ({hours:.1f} hours). "
            f"Maximum supported duration is {max_hours:.0f} hours."
        ),
    )

# Blocked audio file types for security
BLOCKED_AUDIO_EXTENSIONS = [
    # Executable files disguised as audio
    '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1',
    # Scripts
    '.js', '.py', '.php', '.pl', '.rb',
    # Archives
    '.zip', '.tar', '.gz', '.rar',
]


@router.post("/transcribe")
@limiter.limit(RateLimits.AUDIO_UPLOAD)
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    skip_journal_synthesis: str = Form("false"),  # "true" for conversation recordings, "false" for management uploads
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Transcribe audio file to text using OpenAI's speech-to-text"""
    security_service = SecurityService()

    # Verify user has access to session (owner or collaborator)
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    try:
        # Check for blocked file extensions
        file_ext = ('.' + audio.filename.split('.')[-1].lower()) if '.' in audio.filename else ''
        if file_ext in BLOCKED_AUDIO_EXTENSIONS:
            # Log security event for blocked file type attempt
            security_service.log_event(
                db=db,
                event_type="blocked_file_upload",
                email=current_user.email,
                user_id=current_user.id,
                ip_address=security_service.get_client_ip(request),
                user_agent=security_service.get_user_agent(request),
                endpoint="/api/conversation/transcribe",
                details=f"Blocked audio extension: {file_ext}, filename: {audio.filename}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"File type '{file_ext}' is not allowed for security reasons. Allowed audio types: MP3, M4A, WAV, WebM, OGG"
            )

        # Validate audio file type
        allowed_types = ['audio/mpeg', 'audio/mp4', 'audio/mpeg', 'audio/mpga', 'audio/m4a', 'audio/wav', 'audio/webm', 'audio/ogg']
        allowed_extensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg']

        if file_ext not in allowed_extensions and audio.content_type not in allowed_types:
            # Log upload failure
            security_service.log_event(
                db=db,
                event_type="upload_failure",
                email=current_user.email,
                user_id=current_user.id,
                ip_address=security_service.get_client_ip(request),
                user_agent=security_service.get_user_agent(request),
                endpoint="/api/conversation/transcribe",
                details=f"Invalid audio format: {file_ext}, content_type: {audio.content_type}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Invalid audio format. Supported formats: MP3, M4A, WAV, WebM, OGG"
            )

        # Stream-read with size enforcement BEFORE buffering. Aborts with HTTP 413
        # once running byte count exceeds the limit — prevents a multi-GB POST from
        # OOMing the worker before the application-level size check fires.
        try:
            audio_content = await read_upload_with_limit(audio, MAX_AUDIO_FILE_SIZE)
        except HTTPException as e:
            if e.status_code == 400:
                security_service.log_event(
                    db=db,
                    event_type="upload_failure",
                    email=current_user.email,
                    user_id=current_user.id,
                    ip_address=security_service.get_client_ip(request),
                    user_agent=security_service.get_user_agent(request),
                    endpoint="/api/conversation/transcribe",
                    details=f"Audio file size exceeds limit (>{MAX_AUDIO_FILE_SIZE} bytes), filename: {audio.filename}"
                )
            raise

        # Process the audio with ffmpeg subprocesses working on temp files —
        # nothing is decoded into Python memory, so peak RAM stays flat
        # regardless of recording length
        audio_temp_path = None
        mp3_temp_path = None
        chunk_dir = None
        s3_object_pending_row = None
        try:
            try:
                # Determine file extension from original filename for format detection
                file_ext = '.' + audio.filename.split('.')[-1].lower() if '.' in audio.filename else '.webm'

                # Write audio content to temporary file with correct extension
                with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext, mode='wb') as audio_temp:
                    audio_temp.write(audio_content)
                    audio_temp.flush()  # Ensure data is written to disk
                    os.fsync(audio_temp.fileno())  # Force write to disk
                    audio_temp_path = audio_temp.name

                # The bytes now live on disk; drop the in-memory copy
                del audio_content

                # Fast-path duration cap for containers that report a duration.
                # Streamed uploads (e.g. MediaRecorder webm) may not include
                # one; those are re-checked against the transcoded MP3 below.
                probed_duration = await asyncio.to_thread(_probe_audio_duration, audio_temp_path)
                if probed_duration is not None and probed_duration > MAX_AUDIO_DURATION_SECONDS:
                    raise _audio_too_long_error(probed_duration)

                # Transcode once to MP3 on disk — used for OpenAI transcription
                # and stored for browser playback compatibility
                mp3_temp_fd, mp3_temp_path = tempfile.mkstemp(suffix='.mp3')
                os.close(mp3_temp_fd)
                await asyncio.to_thread(_transcode_to_mp3, audio_temp_path, mp3_temp_path)

                duration_seconds = await asyncio.to_thread(_probe_audio_duration, mp3_temp_path)
                if duration_seconds is None:
                    raise ValueError("Unable to determine audio duration after transcoding")
                if duration_seconds > MAX_AUDIO_DURATION_SECONDS:
                    raise _audio_too_long_error(duration_seconds)

                # Persist BEFORE the slow transcription stage: upload the MP3
                # and create the DB row first, so a worker death or client
                # timeout mid-transcription leaves a playable recording
                # instead of losing the upload entirely
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                unique_id = str(uuid.uuid4())[:8]
                original_name = audio.filename.rsplit('.', 1)[0] if '.' in audio.filename else audio.filename
                s3_key = s3_service.get_prefixed_key(f"audio/{session_id}/{timestamp}_{unique_id}_{original_name}.mp3")
                mp3_filename = f"{original_name}.mp3"

                # Upload MP3 to S3 (with Content-Disposition header for security)
                with open(mp3_temp_path, 'rb') as mp3_file:
                    mp3_content = mp3_file.read()
                uploaded = await s3_service.upload_file(mp3_content, s3_key, 'audio/mpeg', mp3_filename)
                del mp3_content
                if not uploaded:
                    raise ValueError("S3 upload failed")
                s3_object_pending_row = s3_key
                logger.info(f"Uploaded converted MP3 to S3: {s3_key}")

                audio_recording = AudioRecording(
                    session_id=session_id,
                    filename=mp3_filename,
                    s3_key=s3_key,
                    duration=duration_seconds,
                    transcribed_text=None,  # filled in after transcription completes
                    category=None,
                    ai_summary=None,
                    created_by_user_id=current_user.id  # Track creator for collaborative sessions
                )
                db.add(audio_recording)
                db.commit()
                db.refresh(audio_recording)
                s3_object_pending_row = None
                logger.info(f"Saved audio recording metadata to database: ID {audio_recording.id}")

                # OpenAI rejects requests over ~1400s of audio — split longer
                # files into chunks on disk (stream copy, no re-encode)
                if duration_seconds > MAX_CHUNK_DURATION_SECONDS:
                    chunk_dir = tempfile.mkdtemp(prefix='audio_chunks_')
                    chunk_paths = await asyncio.to_thread(
                        _segment_mp3, mp3_temp_path, chunk_dir, MAX_CHUNK_DURATION_SECONDS
                    )
                    logger.info(f"Split audio into {len(chunk_paths)} chunks of up to {MAX_CHUNK_DURATION_SECONDS}s each")
                else:
                    chunk_paths = [mp3_temp_path]
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error converting audio to mp3: {str(e)}", exc_info=True)

                # Don't leave an orphaned S3 object if the DB row was never created
                if s3_object_pending_row:
                    await s3_service.delete_file(s3_object_pending_row)

                # Log to database for admin visibility
                try:
                    from app.services.error_logger import log_database_error
                    log_database_error(
                        db=db,
                        source="api.conversation.transcribe_audio.convert_mp3",
                        error=e,
                        user_id=current_user.id,
                        session_id=session_id,
                        details={"filename": audio.filename}
                    )
                except Exception:
                    pass  # Don't let error logging crash the app

                raise HTTPException(status_code=500, detail="Error processing audio file. Please try again.")

            # Transcribe each chunk in sequence. The recording is already
            # persisted, so a failure here degrades to "saved without
            # transcript" rather than a lost upload
            try:
                transcribed_parts = []
                for i, chunk_path in enumerate(chunk_paths):
                    logger.info(f"Transcribing chunk {i+1}/{len(chunk_paths)}")
                    with open(chunk_path, 'rb') as chunk_file:
                        chunk_buffer = io.BytesIO(chunk_file.read())
                    chunk_filename = f"{original_name}_chunk_{i+1}.mp3" if len(chunk_paths) > 1 else mp3_filename
                    chunk_text = await openai_service.transcribe_audio(chunk_buffer, chunk_filename)

                    if chunk_text:
                        transcribed_parts.append(chunk_text)
                        logger.info(f"Chunk {i+1}/{len(chunk_paths)} transcribed successfully")

                    # Chunk files are only needed once — free the disk early
                    if chunk_dir is not None:
                        os.unlink(chunk_path)

                transcribed_text = ' '.join(transcribed_parts)
            except Exception as e:
                logger.error(f"Error transcribing audio: {str(e)}", exc_info=True)

                # Log to database for admin visibility
                try:
                    from app.services.error_logger import log_database_error
                    log_database_error(
                        db=db,
                        source="api.conversation.transcribe_audio.transcribe",
                        error=e,
                        user_id=current_user.id,
                        session_id=session_id,
                        details={"filename": audio.filename, "recording_id": audio_recording.id}
                    )
                except Exception:
                    pass  # Don't let error logging crash the app

                raise HTTPException(
                    status_code=500,
                    detail="Transcription failed, but the recording was saved and can be played back from Audio Recordings."
                )
        finally:
            # Clean up temporary files
            if audio_temp_path and os.path.exists(audio_temp_path):
                os.unlink(audio_temp_path)
            if mp3_temp_path and os.path.exists(mp3_temp_path):
                os.unlink(mp3_temp_path)
            if chunk_dir is not None:
                shutil.rmtree(chunk_dir, ignore_errors=True)

        if not transcribed_text:
            raise HTTPException(
                status_code=500,
                detail="Failed to transcribe audio. The recording was saved and can be played back from Audio Recordings."
            )

        logger.info(f"Successfully transcribed audio for session {session_id}")

        # Use AI to categorize recording and generate summary
        # Wrapped in try/except for backward compatibility - if AI fails, recording still saves
        recording_category = None
        ai_summary = None
        try:
            categorization = await openai_service.categorize_audio_recording(
                transcribed_text or "",
                duration_seconds,
                user_id=current_user.id
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

        # Fill in the transcription + AI metadata on the already-persisted row
        audio_recording.transcribed_text = transcribed_text
        audio_recording.category = recording_category
        audio_recording.ai_summary = ai_summary
        db.commit()
        db.refresh(audio_recording)

        logger.info(f"Updated audio recording {audio_recording.id} with transcription")

        # Create journal entry from audio transcription (only for management page uploads)
        # Conversation recordings skip this and synthesize when the transcribed text is sent as a message
        skip_synthesis = skip_journal_synthesis.lower() == "true"

        if not skip_synthesis:
            try:
                journal_service = JournalService(db)

                # Use entry_date if provided (for timezone handling), otherwise use today
                from datetime import date as date_type
                entry_date = date_type.today()

                # Use specialized audio synthesis method with FULL transcription
                synthesis_result = await journal_service.synthesize_from_audio(
                    filename=audio.filename,
                    transcribed_text=transcribed_text or "",
                    ai_summary=ai_summary or "",
                    duration=duration_seconds,
                    session_id=session_id,
                    entry_date=entry_date,
                    audio_id=audio_recording.id,
                    user_id=current_user.id
                )

                if synthesis_result.should_create and len(synthesis_result.suggested_entries) > 0:
                    logger.info(f"Created {len(synthesis_result.suggested_entries)} comprehensive journal entries from audio recording")
                else:
                    logger.info("No journal entries created from audio recording (not journal-worthy)")

            except Exception as e:
                # Log but don't fail the upload if journal synthesis fails
                logger.warning(f"Failed to create journal entry from audio recording: {e}")
        else:
            logger.info("Skipping journal synthesis for conversation audio recording (will synthesize when message is sent)")

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

        # Log to database for admin visibility
        try:
            from app.services.error_logger import log_database_error
            log_database_error(
                db=db,
                source="api.conversation.transcribe_audio",
                error=e,
                user_id=current_user.id,
                session_id=session_id,
                details={"filename": audio.filename}
            )
        except Exception as log_error:
            logger.error(f"Failed to log error to database: {log_error}")

        raise HTTPException(status_code=500, detail="Error transcribing audio. Please try again.")
