from sqlalchemy import Column, String, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from app.core.database import Base
import uuid

# Challenge expiration in minutes
CHALLENGE_EXPIRY_MINUTES = 5


class MFAChallenge(Base):
    """
    Temporary storage for MFA challenges during authentication.

    During login, if MFA is required, we create a challenge and return
    a short-lived MFA token to the client. The client then submits their
    MFA verification (passkey credential or TOTP code) along with this token.

    Also used for WebAuthn ceremony challenges during passkey registration
    and authentication.
    """
    __tablename__ = "mfa_challenges"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Challenge type: 'login' for login flow, 'webauthn_register' for passkey registration,
    # 'webauthn_auth' for passkey authentication, 'action' for sensitive action re-auth
    challenge_type = Column(String(20), nullable=False)

    # Challenge data (for WebAuthn, this is the random challenge bytes)
    challenge_data = Column(LargeBinary, nullable=False)

    # Expiration
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationship
    user = relationship("User")

    @staticmethod
    def calculate_expiry() -> datetime:
        """Calculate the challenge expiration (5 minutes from now)."""
        return datetime.utcnow() + timedelta(minutes=CHALLENGE_EXPIRY_MINUTES)

    def is_valid(self) -> bool:
        """Check if this challenge is still valid."""
        return datetime.utcnow() < self.expires_at
