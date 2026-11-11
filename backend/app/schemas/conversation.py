from pydantic import BaseModel, Field
from datetime import datetime
from app.models.conversation import MessageRole, MessageType
from typing import Optional

from app.schemas.source_tag import SourceTagInfo


# Upper bounds on free-text input. Every character is model input, so none of these can
# be unbounded. The chat limit is generous on purpose — people paste long portal notes
# and discharge summaries.
#
# These are enforced in the routes (a 4xx with a plain-string `detail`) rather than as
# `Field(max_length=...)`, because clients display `detail` directly and a validation
# error's list-shaped detail is not something they can render.
MAX_MESSAGE_CONTENT_CHARS = 100_000
MAX_JARGON_TERM_CHARS = 200
MAX_JARGON_CONTEXT_CHARS = 4_000
MAX_COACH_SITUATION_CHARS = 8_000


class MessageRequest(BaseModel):
    content: str
    session_id: str = Field(..., max_length=64)
    message_type: str = Field("text", max_length=32)
    document_id: Optional[int] = None
    audio_recording_id: Optional[int] = None
    # No media_url: attachment URLs are generated server-side from document_id.
    # (Older clients still send the field; it is ignored.)
    entry_date: Optional[str] = Field(None, max_length=10)
    user_timezone: Optional[str] = Field(None, max_length=64)
    current_time: Optional[str] = Field(None, max_length=64)


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
    # Source tracking for collaborative sessions
    created_by: Optional[SourceTagInfo] = None
    last_edited_by: Optional[SourceTagInfo] = None

    class Config:
        from_attributes = True


class ConversationHistory(BaseModel):
    messages: list[MessageResponse]
    total_count: int
    has_more: bool


class JargonTranslationRequest(BaseModel):
    medical_term: str
    context: str = ""
    session_id: Optional[str] = None


class JargonTranslationResponse(BaseModel):
    term: str
    explanation: str
    context_note: str = ""


class ConversationCoachRequest(BaseModel):
    situation: str
    session_id: Optional[str] = None


class ConversationCoachResponse(BaseModel):
    content: str


class UpdateMessageRequest(BaseModel):
    content: str


class UpdateMessageResponse(BaseModel):
    id: int
    content: str
    updated_at: datetime
    # Source tracking for collaborative sessions
    last_edited_by: Optional[SourceTagInfo] = None

    class Config:
        from_attributes = True
