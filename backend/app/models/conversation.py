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


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Rich media support
    message_type = Column(Enum(MessageType), default=MessageType.TEXT, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    media_url = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    synthesized_to_journal = Column(Boolean, default=False, nullable=False)
    message_metadata = Column(JSONB, nullable=True)

    # Relationships
    session = relationship("Session", back_populates="conversations")
    document = relationship("Document", foreign_keys=[document_id])
