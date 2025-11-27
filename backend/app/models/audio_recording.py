from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class AudioRecording(Base):
    __tablename__ = "audio_recordings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)
    duration = Column(Float, nullable=True)  # Duration in seconds
    transcribed_text = Column(Text, nullable=True)
    description = Column(Text, nullable=True)  # User-editable description
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("Session", back_populates="audio_recordings")
