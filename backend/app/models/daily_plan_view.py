from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class DailyPlanView(Base):
    """Track which users have viewed which daily plans"""
    __tablename__ = "daily_plan_views"

    id = Column(Integer, primary_key=True, index=True)
    daily_plan_id = Column(Integer, ForeignKey("daily_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    viewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    daily_plan = relationship("DailyPlan", back_populates="views")
    user = relationship("User")

    # Ensure one view record per user per plan
    __table_args__ = (
        UniqueConstraint('daily_plan_id', 'user_id', name='uq_daily_plan_user'),
    )
