from pydantic import BaseModel
from datetime import datetime
from app.models.conversation import MessageRole


class MessageRequest(BaseModel):
    content: str
    session_id: str


class MessageResponse(BaseModel):
    id: int
    role: MessageRole
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationHistory(BaseModel):
    messages: list[MessageResponse]


class MedicalSummaryRequest(BaseModel):
    medical_text: str
    session_id: str


class MedicalSummaryResponse(BaseModel):
    content: str


class JargonTranslationRequest(BaseModel):
    medical_term: str
    context: str = ""


class JargonTranslationResponse(BaseModel):
    term: str
    explanation: str
    context_note: str = ""


class ConversationCoachRequest(BaseModel):
    situation: str
    session_id: str


class ConversationCoachResponse(BaseModel):
    content: str
