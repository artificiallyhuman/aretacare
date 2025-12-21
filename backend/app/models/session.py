from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(15), nullable=False, default="New Session")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_activity = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    # Note: passive_deletes=True tells SQLAlchemy to let the database handle cascade deletes
    # via ON DELETE CASCADE foreign keys, avoiding loading all children into memory
    user = relationship("User", back_populates="sessions", foreign_keys=[user_id])
    owner = relationship("User", foreign_keys=[owner_id])
    collaborators = relationship("SessionCollaborator", back_populates="session", cascade="all, delete-orphan", passive_deletes=True)
    pending_invitations = relationship("PendingInvitation", back_populates="session", cascade="all, delete-orphan", passive_deletes=True)
    documents = relationship("Document", back_populates="session", cascade="all, delete-orphan", passive_deletes=True)
    conversations = relationship("Conversation", back_populates="session", cascade="all, delete-orphan", passive_deletes=True)
    journal_entries = relationship("JournalEntry", back_populates="session", cascade="all, delete-orphan", passive_deletes=True)
    audio_recordings = relationship("AudioRecording", back_populates="session", cascade="all, delete-orphan", passive_deletes=True)
    daily_plans = relationship("DailyPlan", back_populates="session", cascade="all, delete-orphan", passive_deletes=True)
    profile = relationship("Profile", back_populates="session", uselist=False, cascade="all, delete-orphan", passive_deletes=True)
