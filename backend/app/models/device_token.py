from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from datetime import datetime
from app.core.database import Base
import uuid


class DeviceToken(Base):
    """
    Stores APNs device tokens for push notifications.

    Each physical device has one token entry (unique on token).
    Tokens are registered on login and unregistered on logout.
    Invalid tokens are auto-cleaned when APNs reports them.
    """
    __tablename__ = "device_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, nullable=False)
    platform = Column(String(10), nullable=False, default="ios")
    app_version = Column(String(20), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_device_tokens_user_id", "user_id"),
        Index("idx_device_tokens_token", "token", unique=True),
    )
