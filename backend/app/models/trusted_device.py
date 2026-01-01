from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from app.core.database import Base
import uuid

# Trust duration in days
TRUST_DURATION_DAYS = 30


class TrustedDevice(Base):
    """
    Trusted devices that can skip MFA verification.

    When a user successfully completes MFA and chooses to trust the device,
    we store a hashed device token. On subsequent logins from this device,
    MFA can be skipped if the trust hasn't expired.
    """
    __tablename__ = "trusted_devices"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Device identification (hash of the device token stored in cookie)
    device_token_hash = Column(String(255), nullable=False, unique=True, index=True)

    # Device metadata
    device_name = Column(String(255), nullable=True)  # Browser/device description
    ip_address = Column(String(45), nullable=True)  # Last known IP

    # Trust expiration
    trusted_until = Column(DateTime, nullable=False)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    # Relationship
    user = relationship("User", back_populates="trusted_devices")

    @staticmethod
    def calculate_expiry() -> datetime:
        """Calculate the trust expiration date (30 days from now)."""
        return datetime.utcnow() + timedelta(days=TRUST_DURATION_DAYS)

    def is_valid(self) -> bool:
        """Check if this device trust is still valid."""
        return datetime.utcnow() < self.trusted_until

    def update_last_used(self) -> None:
        """Update the last used timestamp."""
        self.last_used_at = datetime.utcnow()

    def extend_trust(self) -> None:
        """Extend the trust period by 30 days from now."""
        self.trusted_until = self.calculate_expiry()
        self.last_used_at = datetime.utcnow()
