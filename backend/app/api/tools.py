from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rate_limit import limiter, RateLimits
from app.models import User, Session as SessionModel, SessionCollaborator
from app.models.consent_record import ConsentRecord, ConsentType
from app.schemas.conversation import (
    JargonTranslationRequest,
    JargonTranslationResponse,
    ConversationCoachRequest,
    ConversationCoachResponse,
    MAX_JARGON_TERM_CHARS,
    MAX_JARGON_CONTEXT_CHARS,
    MAX_COACH_SITUATION_CHARS,
)
from app.services.openai_service import openai_service
from app.services.journal_service import JournalService
from app.api.auth import get_optional_user
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


def _has_ai_data_sharing_consent(db: Session, user_id: str) -> bool:
    """Same query as `require_ai_data_sharing_consent` in api/auth.py.

    These routes are open to signed-out visitors, so they cannot take that dependency
    (it rejects the request outright); the check is applied to the optional context.
    """
    return db.query(ConsentRecord.id).filter(
        ConsentRecord.user_id == user_id,
        ConsentRecord.consent_type == ConsentType.AI_DATA_SHARING,
    ).first() is not None


@router.post("/jargon-translator", response_model=JargonTranslationResponse)
@limiter.limit(RateLimits.AI_TOOLS)
async def translate_medical_jargon(
    request: Request,
    data: JargonTranslationRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Translate medical jargon into plain language with optional journal context"""

    # This endpoint works without an account, so input size is what bounds its cost.
    if len(data.medical_term) > MAX_JARGON_TERM_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Please keep the term under {MAX_JARGON_TERM_CHARS} characters. "
                   "Use the context box for longer passages.",
        )
    if len(data.context or "") > MAX_JARGON_CONTEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Please keep the context under {MAX_JARGON_CONTEXT_CHARS:,} characters.",
        )

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
            # Session context (journal and health profile) is only sent to the model
            # for users with a recorded AI data sharing consent. Without one the tool
            # still works, on the typed input alone.
            if (is_owner or is_collaborator) and _has_ai_data_sharing_consent(db, current_user.id):
                journal_service = JournalService(db)
                journal_context = await journal_service.format_journal_context(data.session_id)

    # End the read transaction so the pooled connection is not held idle for the
    # duration of the model call. Read the id first: this expires loaded objects.
    user_id = current_user.id if current_user else None
    db.rollback()

    translation = await openai_service.translate_jargon(
        data.medical_term,
        data.context,
        journal_context=journal_context,
        user_id=user_id
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

    # This endpoint works without an account, so input size is what bounds its cost.
    if len(data.situation) > MAX_COACH_SITUATION_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Please keep the description under {MAX_COACH_SITUATION_CHARS:,} characters.",
        )

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
            # Session context (journal and health profile) is only sent to the model
            # for users with a recorded AI data sharing consent. Without one the tool
            # still works, on the typed input alone.
            if (is_owner or is_collaborator) and _has_ai_data_sharing_consent(db, current_user.id):
                journal_service = JournalService(db)
                journal_context = await journal_service.format_journal_context(data.session_id)

    # Generate coaching with journal context
    # End the read transaction so the pooled connection is not held idle for the
    # duration of the model call. Read the id first: this expires loaded objects.
    user_id = current_user.id if current_user else None
    db.rollback()

    coaching_data = await openai_service.generate_conversation_coaching(
        data.situation,
        journal_context=journal_context,
        user_id=user_id
    )

    return ConversationCoachResponse(**coaching_data)
