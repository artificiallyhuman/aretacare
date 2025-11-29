"""Shared permission checking functions for API endpoints"""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models import Session as SessionModel, SessionCollaborator


def check_session_access(session: SessionModel, user_id: str, db: Session, require_owner: bool = False):
    """
    Helper function to check if user has access to a session.

    Args:
        session: The session to check access for
        user_id: The user's ID
        db: Database session
        require_owner: If True, only the session owner can access

    Returns:
        bool: True if user is owner, False if user is collaborator

    Raises:
        HTTPException: If user doesn't have access
    """
    is_owner = session.owner_id == user_id
    is_collaborator = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session.id,
        SessionCollaborator.user_id == user_id
    ).first() is not None

    if require_owner and not is_owner:
        raise HTTPException(status_code=403, detail="Only the session owner can perform this action")

    if not (is_owner or is_collaborator):
        raise HTTPException(status_code=403, detail="Access denied")

    return is_owner
