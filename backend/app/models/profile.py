from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid


class Profile(Base):
    """
    Profile model for storing AI-generated long-term memory for a session.

    The profile contains structured information about the patient, caregivers,
    providers, conditions, medications, allergies, events, and preferences.

    Key behaviors:
    - One profile per session (shared by owner and collaborators)
    - AI automatically adds new items without approval
    - AI-proposed edits/deletions require user approval via pending_changes
    - Users can manually edit any field at any time
    - Deleted with session (cascade delete)
    """
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Profile data stored as JSON for flexibility
    # Structure follows the defined schema: patient_info, caregivers, providers,
    # conditions, medications, allergies, events, preferences
    profile_data = Column(JSONB, nullable=False, default=dict)

    # Pending changes proposed by AI that need user approval
    # Each change includes: field_path, change_type (edit/delete), old_value, new_value, reasoning
    pending_changes = Column(JSONB, nullable=True, default=list)

    # Track when the profile was last updated by AI or user
    last_ai_update = Column(DateTime, nullable=True)
    last_user_update = Column(DateTime, nullable=True)

    # Track the last conversation/journal entry that was processed for updates
    # This helps us know what new activity to consider for future updates
    last_processed_conversation_id = Column(Integer, nullable=True)
    last_processed_journal_id = Column(Integer, nullable=True)

    # Standard timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationship to session
    session = relationship("Session", back_populates="profile")
