from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class DailyPlan(Base):
    __tablename__ = "daily_plans"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, index=True)  # The date this plan is for
    content = Column(Text, nullable=False)  # AI-generated plan content
    user_edited_content = Column(Text, nullable=True)  # User's edited version (if any)
    viewed = Column(Boolean, default=False, nullable=False)  # Whether user has viewed this plan
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("Session", back_populates="daily_plans")
