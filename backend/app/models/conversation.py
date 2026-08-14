from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import enum


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


class MessageType(str, enum.Enum):
    TEXT = "text"
    DOCUMENT = "document"
    IMAGE = "image"
    AUDIO = "audio"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, nullable=True)

    # Rich media support
    message_type = Column(Enum(MessageType), default=MessageType.TEXT, nullable=False)
    # index=True on both FK columns is required, not just an optimisation: Postgres runs
    # ON DELETE SET NULL as a per-row trigger, so deleting a document/recording issues an
    # UPDATE ... WHERE document_id = ? against this table. Without an index that is a
    # sequential scan of every conversation on the platform, once per deleted row — which is
    # what made deleting a care session take tens of seconds. (audio_recording_id is already
    # covered by idx_conversations_audio; document_id was not.)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)
    audio_recording_id = Column(Integer, ForeignKey("audio_recordings.id", ondelete="SET NULL"), nullable=True)
    media_url = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    synthesized_to_journal = Column(Boolean, default=False, nullable=False)
    message_metadata = Column(JSONB, nullable=True)

    # Source tracking for collaborative sessions
    created_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    # Same reasoning as document_id above — this one fires on account deletion.
    last_edited_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    session = relationship("Session", back_populates="conversations")
    document = relationship("Document", foreign_keys=[document_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    last_edited_by = relationship("User", foreign_keys=[last_edited_by_user_id])
