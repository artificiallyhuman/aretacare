from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class DailyPlan(Base):
    __tablename__ = "daily_plans"
    __table_args__ = (
        UniqueConstraint('session_id', 'date', name='uq_daily_plan_session_date'),
    )

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, index=True)  # The date this plan is for
    content = Column(Text, nullable=False)  # AI-generated plan content
    user_edited_content = Column(Text, nullable=True)  # User's edited version (if any)
    viewed = Column(Boolean, default=False, nullable=False)  # DEPRECATED: Use views relationship for per-user tracking
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("Session", back_populates="daily_plans")
    views = relationship("DailyPlanView", back_populates="daily_plan", cascade="all, delete-orphan")
