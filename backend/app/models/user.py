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

    # Stamped on successful login (password login and MFA-verify completion), never on
    # token refresh. Exists because refresh tokens expire after 7 days and expired rows
    # are cleaned up, so they cannot answer "when did this user last log in".
    last_login_at = Column(DateTime, nullable=True)

    # Admin campaign email preferences (product-update emails only — never transactional).
    # The token has no expiry: the unsubscribe link must keep working long after the email
    # was sent, and it survives unsubscription so re-clicking the link stays idempotent.
    unsubscribe_token = Column(String, unique=True, index=True, nullable=True)
    email_unsubscribed_at = Column(DateTime, nullable=True)

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
    consent_records = relationship(
        "ConsentRecord",
        back_populates="user",
        cascade="all, delete-orphan"
    )
