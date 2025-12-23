from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from ..core.database import Base
import secrets


class WaitlistEntry(Base):
    """Model for users waiting to be invited to join AretaCare"""
    __tablename__ = "waitlist"

    id = Column(String, primary_key=True, default=lambda: secrets.token_urlsafe(32))
    email = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    invited_at = Column(DateTime, nullable=True)  # When admin sent invitation
    invitation_token = Column(String(43), unique=True, nullable=True, index=True)  # Token for registration
    invitation_expires = Column(DateTime, nullable=True)  # Token expiration
    notes = Column(Text, nullable=True)  # Admin notes about this entry
    added_by_email = Column(String(255), nullable=True)  # Who added this entry (admin email or referrer email, null if self-joined)
    # Users who tried to add this person as a collaborator
    # Format: [{"user_id": "...", "user_email": "...", "session_name": "..."}, ...]
    referrers = Column(JSONB, nullable=True)

    def __repr__(self):
        return f"<WaitlistEntry(email='{self.email}')>"
