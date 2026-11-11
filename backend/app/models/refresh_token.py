from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import secrets


class RefreshToken(Base):
    """
    Refresh token model for managing user sessions across devices.

    Refresh tokens are long-lived tokens (7 days max) used to obtain new
    short-lived access tokens (1 hour). This allows:
    - Better security (stolen access tokens expire quickly)
    - Token revocation (logout everywhere, ban user)
    - Session management across devices
    """
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # SHA-256 of the token; this is what lookups use. The token is a 256-bit random
    # value, so an unsalted fast hash is sufficient and keeps the lookup indexed. With
    # only the hash stored, read access to this table does not yield usable sessions.
    token_hash = Column(String(64), nullable=True, unique=True, index=True)

    # Legacy column. Holds the raw token while settings.REFRESH_TOKEN_STORE_RAW is True
    # (rolling-deploy compatibility) and a copy of the hash afterwards.
    token = Column(String, nullable=False, unique=True, index=True)

    # Token metadata
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, nullable=True)

    # Revocation
    is_revoked = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(DateTime, nullable=True)
    # Set only when the token was revoked by rotation (exchanged for a new one), as
    # opposed to logout or an admin action. Distinguishes "just rotated, may be
    # retried" and "rotated long ago, should never be seen again" from a signed-out token.
    replaced_at = Column(DateTime, nullable=True)

    # Device/session information (optional, for display purposes)
    device_info = Column(String, nullable=True)  # User agent or device description
    ip_address = Column(String, nullable=True)

    # Relationship
    user = relationship("User", back_populates="refresh_tokens")

    @staticmethod
    def generate_token() -> str:
        """Generate a cryptographically secure random token."""
        return secrets.token_urlsafe(32)

    def is_valid(self) -> bool:
        """Check if token is valid (not expired and not revoked)."""
        if self.is_revoked:
            return False
        if datetime.utcnow() > self.expires_at:
            return False
        return True
