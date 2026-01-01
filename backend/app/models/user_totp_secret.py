from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid


class UserTOTPSecret(Base):
    """
    TOTP secret for authenticator app MFA.

    Stores the encrypted TOTP secret used to verify 6-digit codes
    from authenticator apps like Google Authenticator, Authy, etc.
    Each user can have only one active TOTP configuration.
    """
    __tablename__ = "user_totp_secrets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # TOTP secret (encrypted at rest)
    # The encryption is handled by the MFA service before storage
    secret_encrypted = Column(String(255), nullable=False)

    # Setup status
    verified = Column(Boolean, nullable=False, default=False)

    # Replay protection: tracks the last TOTP time counter used
    # This prevents the same code from being used twice within its validity window
    last_used_counter = Column(BigInteger, nullable=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    # Relationship
    user = relationship("User", back_populates="totp_secret")

    def mark_verified(self) -> None:
        """Mark the TOTP setup as verified after user confirms with a valid code."""
        self.verified = True

    def update_last_used(self) -> None:
        """Update the last used timestamp after successful verification."""
        self.last_used_at = datetime.utcnow()
