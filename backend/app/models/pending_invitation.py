from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base
import secrets


class PendingInvitation(Base):
    """Model for pending collaboration invitations to users who don't have accounts yet"""
    __tablename__ = "pending_invitations"

    id = Column(String, primary_key=True, default=lambda: secrets.token_urlsafe(32))
    email = Column(String, nullable=False, index=True)  # Email of person being invited
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    invited_by_user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, unique=True, nullable=False, default=lambda: secrets.token_urlsafe(32))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("Session", back_populates="pending_invitations")
    invited_by = relationship("User", foreign_keys=[invited_by_user_id])

    def __repr__(self):
        return f"<PendingInvitation(email='{self.email}', session_id='{self.session_id}')>"
