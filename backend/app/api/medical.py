from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Session as SessionModel, Conversation, MessageRole, User
from app.schemas import (
    MedicalSummaryRequest,
    MedicalSummaryResponse,
    JargonTranslationRequest,
    JargonTranslationResponse,
    ConversationCoachRequest,
    ConversationCoachResponse,
    MessageRequest,
    MessageResponse,
    ConversationHistory,
)
from app.api.permissions import check_session_access
from app.services import openai_service
from app.api.auth import get_current_user
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/medical", tags=["medical"])


def get_conversation_context(session_id: str, db: Session) -> List[dict]:
    """Get recent conversation history for context"""
    conversations = db.query(Conversation).filter(
        Conversation.session_id == session_id
    ).order_by(Conversation.created_at.desc()).limit(10).all()

    return [
        {"role": conv.role.value, "content": conv.content}
        for conv in reversed(conversations)
    ]


@router.post("/summary", response_model=MedicalSummaryResponse)
async def generate_medical_summary(
    request: MedicalSummaryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate structured medical summary from provided text"""

    # Validate session
    session = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    check_session_access(session, current_user.id, db)

    # Get conversation context
    context = get_conversation_context(request.session_id, db)

    # Generate summary
    summary_data = await openai_service.generate_medical_summary(
        request.medical_text,
        context
    )

    # Store the interaction
    user_message = Conversation(
        session_id=request.session_id,
        role=MessageRole.USER,
        content=f"Medical Summary Request: {request.medical_text[:200]}..."
    )
    db.add(user_message)

    assistant_message = Conversation(
        session_id=request.session_id,
        role=MessageRole.ASSISTANT,
        content=summary_data['content']
    )
    db.add(assistant_message)
    db.commit()

    return MedicalSummaryResponse(**summary_data)


@router.post("/translate", response_model=JargonTranslationResponse)
async def translate_medical_jargon(
    request: JargonTranslationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Translate medical jargon into plain language"""

    translation = await openai_service.translate_jargon(
        request.medical_term,
        request.context
    )

    return JargonTranslationResponse(**translation)


@router.post("/coach", response_model=ConversationCoachResponse)
async def get_conversation_coaching(
    request: ConversationCoachRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get coaching for healthcare conversations"""

    # Validate session
    session = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    check_session_access(session, current_user.id, db)

    # Get conversation context
    context = get_conversation_context(request.session_id, db)

    # Generate coaching
    coaching_data = await openai_service.generate_conversation_coaching(
        request.situation,
        context
    )

    # Store the interaction
    user_message = Conversation(
        session_id=request.session_id,
        role=MessageRole.USER,
        content=f"Conversation Coaching Request: {request.situation}"
    )
    db.add(user_message)

    assistant_message = Conversation(
        session_id=request.session_id,
        role=MessageRole.ASSISTANT,
        content=coaching_data['content']
    )
    db.add(assistant_message)
    db.commit()

    return ConversationCoachResponse(**coaching_data)


@router.post("/chat", response_model=MessageResponse)
async def chat(
    request: MessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """General chat interface with safety boundaries"""

    # Validate session
    session = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    check_session_access(session, current_user.id, db)

    # Get conversation history
    context = get_conversation_context(request.session_id, db)

    # Store user message
    user_message = Conversation(
        session_id=request.session_id,
        role=MessageRole.USER,
        content=request.content
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Generate response
    response_text = await openai_service.chat(request.content, context)

    # Store assistant response
    assistant_message = Conversation(
        session_id=request.session_id,
        role=MessageRole.ASSISTANT,
        content=response_text
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    return assistant_message


@router.get("/conversation/{session_id}", response_model=ConversationHistory)
async def get_conversation_history(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get conversation history for a session"""

    # Validate session
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    check_session_access(session, current_user.id, db)

    conversations = db.query(Conversation).filter(
        Conversation.session_id == session_id
    ).order_by(Conversation.created_at).all()

    return ConversationHistory(messages=conversations)
