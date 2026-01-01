from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Password reset fields
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)

    # Email change verification fields
    pending_email = Column(String, nullable=True)
    email_change_token = Column(String, nullable=True)
    email_change_token_expires = Column(DateTime, nullable=True)

    # Email verification fields (for new user registration)
    is_email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_token = Column(String, nullable=True)
    email_verification_token_expires = Column(DateTime, nullable=True)

    # Track last active session for user
    last_active_session_id = Column(String, nullable=True)

    # MFA fields
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    mfa_preferred_method = Column(String(20), nullable=True)  # 'passkey' or 'totp'
    mfa_enabled_at = Column(DateTime, nullable=True)

    # Relationships
    sessions = relationship(
        "Session",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="Session.user_id"
    )
    refresh_tokens = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    passkeys = relationship(
        "UserPasskey",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    totp_secret = relationship(
        "UserTOTPSecret",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )
    backup_codes = relationship(
        "UserBackupCode",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    trusted_devices = relationship(
        "TrustedDevice",
        back_populates="user",
        cascade="all, delete-orphan"
    )
