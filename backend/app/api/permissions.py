"""Shared permission checking functions for API endpoints"""
from fastapi import HTTPException, Depends, status
from sqlalchemy.orm import Session
from app.models import Session as SessionModel, SessionCollaborator
from app.models.user import User
from app.core.config import settings


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


def check_is_admin(user: User) -> bool:
    """
    Check if a user is an admin.

    Args:
        user: The user to check

    Returns:
        bool: True if user is admin
    """
    admin_emails = settings.admin_emails_list
    if not admin_emails:
        return False
    return user.email.lower() in admin_emails


def require_admin(current_user: User) -> User:
    """
    Verify that the current user is an admin.

    This is NOT a FastAPI dependency - use get_admin_user instead.
    This is a helper function for use within endpoints.

    Args:
        current_user: The authenticated user

    Returns:
        User: The admin user if authorized

    Raises:
        HTTPException: 403 if user is not an admin
    """
    if not check_is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
