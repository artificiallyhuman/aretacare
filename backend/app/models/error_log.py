from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from app.core.database import Base


class ErrorLog(Base):
    __tablename__ = "error_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    level = Column(String(20), nullable=False, index=True)  # ERROR, WARNING, CRITICAL
    source = Column(String(255), nullable=False, index=True)  # Module/function name
    message = Column(Text, nullable=False)
    stack_trace = Column(Text, nullable=True)
    user_id = Column(String, nullable=True)  # If error is user-specific
    session_id = Column(String, nullable=True)  # If error is session-specific
    details = Column(JSONB, nullable=True)  # Additional context
