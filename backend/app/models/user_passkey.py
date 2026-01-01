from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid


class UserPasskey(Base):
    """
    WebAuthn passkey credentials for MFA.

    Stores the public key and credential information needed to verify
    passkey authentication. Each user can have multiple passkeys
    (e.g., different devices, backup keys).
    """
    __tablename__ = "user_passkeys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # WebAuthn credential data
    credential_id = Column(LargeBinary, nullable=False, unique=True, index=True)
    public_key = Column(LargeBinary, nullable=False)
    counter = Column(Integer, nullable=False, default=0)

    # Credential metadata
    device_name = Column(String(100), nullable=False)
    transports = Column(String(255), nullable=True)  # JSON array: ["internal", "usb", "nfc", "ble"]
    backed_up = Column(Boolean, nullable=False, default=False)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    # Relationship
    user = relationship("User", back_populates="passkeys")

    def update_counter(self, new_counter: int) -> None:
        """Update the signature counter after successful authentication."""
        self.counter = new_counter
        self.last_used_at = datetime.utcnow()
