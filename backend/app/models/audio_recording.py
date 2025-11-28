from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import enum


class AudioRecordingCategory(str, enum.Enum):
    """Categories for audio recordings based on content type"""
    SYMPTOM_UPDATE = "symptom_update"
    APPOINTMENT_RECAP = "appointment_recap"
    MEDICATION_NOTE = "medication_note"
    QUESTION_FOR_DOCTOR = "question_for_doctor"
    DAILY_REFLECTION = "daily_reflection"
    PROGRESS_UPDATE = "progress_update"
    SIDE_EFFECTS = "side_effects"
    CARE_INSTRUCTION = "care_instruction"
    EMERGENCY_NOTE = "emergency_note"
    FAMILY_UPDATE = "family_update"
    TREATMENT_OBSERVATION = "treatment_observation"
    OTHER = "other"


class AudioRecording(Base):
    __tablename__ = "audio_recordings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)
    duration = Column(Float, nullable=True)  # Duration in seconds
    transcribed_text = Column(Text, nullable=True)
    description = Column(Text, nullable=True)  # User-editable description
    category = Column(SQLEnum(AudioRecordingCategory), nullable=True)  # AI-generated category
    ai_summary = Column(Text, nullable=True)  # AI-generated brief summary
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("Session", back_populates="audio_recordings")
