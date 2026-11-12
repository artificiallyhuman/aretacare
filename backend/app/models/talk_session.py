"""A live voice conversation (iOS Talk mode). See services/talk_session_service.py."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class TalkStatus(str, enum.Enum):
    ACTIVE = "active"            # Call in progress (or its instance died: see heartbeat_at)
    FINALIZING = "finalizing"    # Claimed for saving; exactly one finalizer wins the claim
    COMPLETED = "completed"
    FAILED = "failed"


class TalkOutcome(str, enum.Enum):
    AUDIO = "audio"                      # Recording saved to Audio Recordings
    TRANSCRIPT_ONLY = "transcript_only"  # Audio lost; the turns were posted to chat
    DISCARDED = "discarded"              # Nothing was said


class TalkSession(Base):
    __tablename__ = "talk_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    openai_session_id = Column(String, nullable=True)
    # "Talk_2026-11-12_3-15PM" in the caller's timezone; becomes the recording's filename.
    recording_name = Column(String, nullable=True)
    # Plain strings (not SQLEnum) so no PG enum type ever needs migrating.
    status = Column(String, nullable=False, default=TalkStatus.ACTIVE.value)
    outcome = Column(String, nullable=True)
    end_reason = Column(String, nullable=True)

    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    max_seconds = Column(Integer, nullable=False)
    duration_seconds = Column(Float, nullable=True)
    # Stamped by the sideband task every few seconds. An 'active' row whose heartbeat is
    # older than TALK_STALE_SECONDS lost its instance and may be claimed by any other.
    heartbeat_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # When the user was last heard. `confirm_action` requires speech after the proposal,
    # so the model cannot propose and confirm a write in one breath.
    last_user_speech_at = Column(DateTime, nullable=True)

    # SHA-256 of the opaque token the MCP endpoint accepts for this call. The token is
    # only valid while status = 'active'.
    mcp_token_hash = Column(String(64), nullable=False, unique=True)
    tool_call_count = Column(Integer, nullable=False, default=0)
    pending_actions = Column(JSONB, nullable=True)   # proposed writes awaiting a spoken yes
    transcript = Column(JSONB, nullable=True)        # [{role, text, start_ms, end_ms}]

    audio_recording_id = Column(Integer, ForeignKey("audio_recordings.id", ondelete="SET NULL"), nullable=True)
    journal_entries_created = Column(Integer, nullable=True)
