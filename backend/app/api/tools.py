from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User
from app.schemas.conversation import (
    MedicalSummaryRequest,
    MedicalSummaryResponse,
    JargonTranslationRequest,
    JargonTranslationResponse,
    ConversationCoachRequest,
    ConversationCoachResponse
)
from app.services.openai_service import openai_service
from app.api.auth import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/medical-summary", response_model=MedicalSummaryResponse)
async def generate_medical_summary(
    medical_text: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate structured medical summary (standalone tool, doesn't affect conversation)"""

    # Generate summary without conversation context (standalone mode)
    summary_data = await openai_service.generate_medical_summary(
        medical_text,
        context=None  # No conversation context for standalone tool
    )

    return MedicalSummaryResponse(**summary_data)


@router.post("/jargon-translator", response_model=JargonTranslationResponse)
async def translate_medical_jargon(
    medical_term: str,
    context: str = "",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Translate medical jargon into plain language (standalone tool)"""

    translation = await openai_service.translate_jargon(
        medical_term,
        context
    )

    return JargonTranslationResponse(**translation)


@router.post("/conversation-coach", response_model=ConversationCoachResponse)
async def get_conversation_coaching(
    situation: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get coaching for healthcare conversations (standalone tool)"""

    # Generate coaching without conversation context (standalone mode)
    coaching_data = await openai_service.generate_conversation_coaching(
        situation,
        context=None  # No conversation context for standalone tool
    )

    return ConversationCoachResponse(**coaching_data)
