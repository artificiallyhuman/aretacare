"""
Helper functions for source tag attribution in collaborative sessions.

Source tags show who created/edited items when a session has collaborators,
helping users identify contributions from different team members.
"""

from sqlalchemy.orm import Session
from typing import Optional, List, Dict

from app.models import User, SessionCollaborator
from app.schemas.source_tag import SourceTagInfo, get_initials


def session_has_collaborators(session_id: str, db: Session) -> bool:
    """Check if a session has any collaborators."""
    return db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id
    ).first() is not None


def build_source_tag_info(user: Optional[User]) -> Optional[SourceTagInfo]:
    """
    Build source tag info from a User object.

    Args:
        user: The User model instance, or None

    Returns:
        SourceTagInfo with user_id, name, and initials, or None if no user
    """
    if not user:
        return None

    return SourceTagInfo(
        user_id=user.id,
        name=user.name or "Unknown",
        initials=get_initials(user.name or "")
    )


def get_user_map(user_ids: List[str], db: Session) -> Dict[str, User]:
    """
    Batch load users by their IDs for efficient source tag generation.

    Args:
        user_ids: List of user IDs to load
        db: Database session

    Returns:
        Dictionary mapping user_id to User object
    """
    if not user_ids:
        return {}

    # Remove None values and duplicates
    unique_ids = list(set(uid for uid in user_ids if uid))
    if not unique_ids:
        return {}

    users = db.query(User).filter(User.id.in_(unique_ids)).all()
    return {user.id: user for user in users}
