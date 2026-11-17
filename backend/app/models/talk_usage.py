"""Talk voice time from calls whose care session was deleted.

The daily Talk allowance (`TALK_DAILY_SECONDS_PER_USER`) is summed from `talk_sessions`,
and those rows cascade away with their care session, so deleting and recreating a care
session used to reset it. `talk_session_service.carry_over_usage` copies the last 24 hours
of such calls here first; `seconds_used_today` adds them in. Only the user id, the call's
start and its length are kept, and rows older than 24 hours are deleted.
"""
from sqlalchemy import Column, DateTime, Float, Integer, String

from app.core.database import Base


class TalkUsage(Base):
    __tablename__ = "talk_usage"

    id = Column(Integer, primary_key=True)
    # No foreign key to users: creating one locks that table while the new table is
    # created at deploy, and these rows expire within a day anyway.
    user_id = Column(String(36), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False, index=True)
    seconds = Column(Float, nullable=False)
