from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Date, Enum, ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, date
from app.core.database import Base
import enum


class EntryType(str, enum.Enum):
    MEDICAL_UPDATE = "MEDICAL_UPDATE"
    TREATMENT_CHANGE = "TREATMENT_CHANGE"
    APPOINTMENT = "APPOINTMENT"
    INSIGHT = "INSIGHT"
    QUESTION = "QUESTION"
    MILESTONE = "MILESTONE"


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    entry_type = Column(Enum(EntryType), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    created_by = Column(String, nullable=False)  # 'ai' or user_id
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    source_message_ids = Column(ARRAY(Integer), nullable=True)  # Links to conversation messages
    entry_metadata = Column(JSONB, nullable=True)  # Flexible additional data

    # Relationships
    session = relationship("Session", back_populates="journal_entries")
