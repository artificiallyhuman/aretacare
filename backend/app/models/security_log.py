"""
Security log model for tracking unauthorized access attempts.
"""
from sqlalchemy import Column, String, Text, DateTime, Integer
from sqlalchemy.sql import func
from app.core.database import Base


class SecurityLog(Base):
    """Security log for unauthorized access attempts."""
    __tablename__ = "security_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)  # failed_login, invalid_token, unauthorized_access
    email = Column(String(255), nullable=True, index=True)  # Email if available
    user_id = Column(String(36), nullable=True, index=True)  # User ID if available
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(500), nullable=True)  # Browser/client info
    endpoint = Column(String(255), nullable=True)  # API endpoint accessed
    details = Column(Text, nullable=True)  # Additional context
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
