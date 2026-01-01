from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid


class UserBackupCode(Base):
    """
    Backup recovery codes for MFA account recovery.

    Each user gets 10 backup codes when enabling MFA. Each code can
    only be used once. Codes are stored as bcrypt hashes for security.
    """
    __tablename__ = "user_backup_codes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Backup code hash (bcrypt)
    # Plain codes are shown once during setup and never stored
    code_hash = Column(String(255), nullable=False)

    # Usage tracking
    used_at = Column(DateTime, nullable=True)  # NULL if not yet used
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationship
    user = relationship("User", back_populates="backup_codes")

    @property
    def is_used(self) -> bool:
        """Check if this backup code has been used."""
        return self.used_at is not None

    def mark_used(self) -> None:
        """Mark this backup code as used."""
        self.used_at = datetime.utcnow()
