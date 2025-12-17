from pydantic import BaseModel
from datetime import datetime
from app.models.conversation import MessageRole, MessageType
from typing import Optional


class MessageRequest(BaseModel):
    content: str
    session_id: str


class MessageResponse(BaseModel):
    id: int
    session_id: str
    role: MessageRole
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    message_type: Optional[MessageType] = None
    document_id: Optional[int] = None
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    extracted_text: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationHistory(BaseModel):
    messages: list[MessageResponse]
    total_count: int
    has_more: bool


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


class UpdateMessageRequest(BaseModel):
    content: str


class UpdateMessageResponse(BaseModel):
    id: int
    content: str
    updated_at: datetime

    class Config:
        from_attributes = True
