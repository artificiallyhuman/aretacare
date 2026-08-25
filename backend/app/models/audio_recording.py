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
    PROVIDER_CONVERSATION = "provider_conversation"
    OTHER = "other"


class TranscriptionStatus(str, enum.Enum):
    """Lifecycle of the background transcription job (services/audio_transcription_service.py)"""
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AudioRecording(Base):
    __tablename__ = "audio_recordings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)
    duration = Column(Float, nullable=True)  # Duration in seconds
    transcribed_text = Column(Text, nullable=True)
    category = Column(SQLEnum(AudioRecordingCategory), nullable=True)  # AI-generated category
    ai_summary = Column(Text, nullable=True)  # AI-generated brief summary
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Background transcription job state. A plain string (not SQLEnum) so no PG enum
    # type needs migrating; the server default keeps pre-existing rows 'completed'.
    transcription_status = Column(
        String, nullable=False,
        default=TranscriptionStatus.COMPLETED.value, server_default=TranscriptionStatus.COMPLETED.value,
    )
    # Heartbeat: set on creation, after each transcribed chunk, and on finish. A
    # 'processing' row whose heartbeat is older than AUDIO_TRANSCRIPTION_STALE_SECONDS
    # is reported as 'failed' (its job died) so the user can retry.
    transcription_updated_at = Column(DateTime, nullable=True)

    # Source tracking for collaborative sessions
    created_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    last_edited_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    session = relationship("Session", back_populates="audio_recordings")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    last_edited_by = relationship("User", foreign_keys=[last_edited_by_user_id])
