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
    # NOTE: document_id and last_edited_by_user_id below deliberately do NOT declare
    # index=True, even though both are indexed in the database.
    #
    # They need an index: Postgres enforces ON DELETE SET NULL with a per-row trigger, so
    # deleting a document issues "UPDATE conversations SET document_id = NULL WHERE
    # document_id = ?" once per deleted row — a sequential scan of this whole table without
    # one. That is what made deleting a care session take tens of seconds.
    #
    # But the indexes are created by the `add_conversations_set_null_fk_indexes` migration
    # in core/migrations.py, which is the only mechanism that reaches *existing* databases
    # (create_all never alters an existing table). Declaring index=True here as well would
    # make create_all add a second, redundant index on a fresh database —
    # ix_conversations_document_id alongside idx_conversations_document. One source of
    # truth: the migration.
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    audio_recording_id = Column(Integer, ForeignKey("audio_recordings.id", ondelete="SET NULL"), nullable=True)
    media_url = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    synthesized_to_journal = Column(Boolean, default=False, nullable=False)
    message_metadata = Column(JSONB, nullable=True)

    # Source tracking for collaborative sessions
    created_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    # Indexed by the same migration as document_id (see the note above) — this one's
    # SET NULL trigger fires on account deletion.
    last_edited_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    session = relationship("Session", back_populates="conversations")
    document = relationship("Document", foreign_keys=[document_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    last_edited_by = relationship("User", foreign_keys=[last_edited_by_user_id])
