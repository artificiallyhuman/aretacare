from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from app.core.database import Base
from datetime import datetime
import uuid


class UserSessionColor(Base):
    __tablename__ = "user_session_colors"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    color_key = Column(String(30), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint('user_id', 'session_id', name='uq_user_session_color'),
    )
