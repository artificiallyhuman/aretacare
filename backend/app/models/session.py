from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(15), nullable=False, default="New Session")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_activity = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Primary session support (one long-running session per user)
    is_primary = Column(Boolean, default=False, nullable=False)
    journal_entry_count = Column(Integer, default=0, nullable=False)
    last_journal_synthesis = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="sessions")
    documents = relationship("Document", back_populates="session", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="session", cascade="all, delete-orphan")
    journal_entries = relationship("JournalEntry", back_populates="session", cascade="all, delete-orphan")
    audio_recordings = relationship("AudioRecording", back_populates="session", cascade="all, delete-orphan")
    daily_plans = relationship("DailyPlan", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_user_primary', 'user_id', 'is_primary', unique=True, postgresql_where=(is_primary == True)),
    )
