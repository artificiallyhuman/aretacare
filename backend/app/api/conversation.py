from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Session as SessionModel, Conversation, Document
from app.models.conversation import MessageRole, MessageType
from app.schemas.conversation import MessageRequest, MessageResponse, ConversationHistory
from app.services.openai_service import openai_service
from app.services.journal_service import JournalService
from app.services.s3_service import s3_service
from app.api.auth import get_current_user
from typing import Optional

router = APIRouter(prefix="/conversation", tags=["conversation"])


@router.post("/message", response_model=dict)
async def send_message(
    content: str,
    session_id: str,
    message_type: str = "text",
    document_id: Optional[int] = None,
    media_url: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message in the conversation (with optional rich media)"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

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

        # Assess for journal synthesis (include document content)
        synthesis_result = await journal_service.assess_and_synthesize(
            user_message=complete_message,
            ai_response=ai_response_text,
            session_id=session_id,
            conversation_id=user_message.id
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
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

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
