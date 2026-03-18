from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rate_limit import limiter, RateLimits
from app.models import User, Session as SessionModel, SessionCollaborator
from app.schemas.conversation import (
    JargonTranslationRequest,
    JargonTranslationResponse,
    ConversationCoachRequest,
    ConversationCoachResponse
)
from app.services.openai_service import openai_service
from app.services.journal_service import JournalService
from app.api.auth import get_optional_user
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/jargon-translator", response_model=JargonTranslationResponse)
@limiter.limit(RateLimits.AI_TOOLS)
async def translate_medical_jargon(
    request: Request,
    data: JargonTranslationRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Translate medical jargon into plain language with optional journal context"""

    # Get journal context if authenticated and session_id provided
    journal_context = None
    if current_user and data.session_id:
        # Verify session belongs to current user
        session = db.query(SessionModel).filter(SessionModel.id == data.session_id).first()
        if session:
            # Check if user has access (owner or collaborator)
            is_owner = session.owner_id == current_user.id
            is_collaborator = db.query(SessionCollaborator).filter(
                SessionCollaborator.session_id == session.id,
                SessionCollaborator.user_id == current_user.id
            ).first() is not None
            if is_owner or is_collaborator:
                journal_service = JournalService(db)
                journal_context = await journal_service.format_journal_context(data.session_id)

    translation = await openai_service.translate_jargon(
        data.medical_term,
        data.context,
        journal_context=journal_context,
        user_id=current_user.id if current_user else None
    )

    return JargonTranslationResponse(**translation)


@router.post("/conversation-coach", response_model=ConversationCoachResponse)
@limiter.limit(RateLimits.AI_TOOLS)
async def get_conversation_coaching(
    request: Request,
    data: ConversationCoachRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Get coaching for healthcare conversations with optional journal context"""

    # Get journal context if authenticated and session_id provided
    journal_context = None
    if current_user and data.session_id:
        # Verify session belongs to current user
        session = db.query(SessionModel).filter(SessionModel.id == data.session_id).first()
        if session:
            # Check if user has access (owner or collaborator)
            is_owner = session.owner_id == current_user.id
            is_collaborator = db.query(SessionCollaborator).filter(
                SessionCollaborator.session_id == session.id,
                SessionCollaborator.user_id == current_user.id
            ).first() is not None
            if is_owner or is_collaborator:
                journal_service = JournalService(db)
                journal_context = await journal_service.format_journal_context(data.session_id)

    # Generate coaching with journal context
    coaching_data = await openai_service.generate_conversation_coaching(
        data.situation,
        journal_context=journal_context,
        user_id=current_user.id if current_user else None
    )

    return ConversationCoachResponse(**coaching_data)
