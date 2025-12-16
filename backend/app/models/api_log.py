from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class ApiLog(Base):
    """Log of GPT API requests for monitoring and debugging"""
    __tablename__ = "api_logs"

    id = Column(Integer, primary_key=True, index=True)
    feature = Column(String(50), nullable=False, index=True)  # e.g., conversation, daily_plan, jargon_translator
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    success = Column(Boolean, nullable=False, default=True)
    error_message = Column(Text, nullable=True)  # Error details if failed
    model = Column(String(50), nullable=True)  # Model used
    response_time_ms = Column(Integer, nullable=True)  # Response time in milliseconds
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
