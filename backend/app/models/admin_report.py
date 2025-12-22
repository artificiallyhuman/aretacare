"""Admin Report model for storing AI-generated daily admin reports."""
from datetime import datetime
from sqlalchemy import Column, Integer, Text, Boolean, Date, DateTime

from app.core.database import Base


class AdminReport(Base):
    """Stores AI-generated daily admin reports that summarize system logs."""
    __tablename__ = "admin_reports"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    content = Column(Text, nullable=False)  # AI-generated markdown summary
    has_concerns = Column(Boolean, default=False)  # Whether report found issues requiring attention
    security_log_count = Column(Integer, default=0)  # Number of security logs analyzed
    error_log_count = Column(Integer, default=0)  # Number of error logs analyzed
    api_log_count = Column(Integer, default=0)  # Number of API logs analyzed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
