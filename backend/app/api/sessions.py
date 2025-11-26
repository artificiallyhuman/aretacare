from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Session as SessionModel, User
from app.schemas import SessionCreate, SessionResponse
from datetime import datetime, timedelta
from app.core.config import settings
from app.api.auth import get_current_user

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/", response_model=SessionResponse)
async def create_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new session for the authenticated user"""
    new_session = SessionModel(user_id=current_user.id)
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get session details"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Update last activity
    session.last_activity = datetime.utcnow()
    db.commit()

    return session


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a session and all associated data"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # This will cascade delete all documents and conversations
    db.delete(session)
    db.commit()

    return {"message": "Session deleted successfully"}


@router.post("/{session_id}/cleanup")
async def cleanup_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark session as inactive (for privacy, keeping data temporarily for session)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    session.is_active = False
    db.commit()

    return {"message": "Session marked as inactive"}


@router.post("/cleanup-expired")
async def cleanup_expired_sessions(db: Session = Depends(get_db)):
    """Clean up expired sessions (for privacy protection)"""
    expiration_time = datetime.utcnow() - timedelta(minutes=settings.SESSION_TIMEOUT_MINUTES)

    expired_sessions = db.query(SessionModel).filter(
        SessionModel.last_activity < expiration_time
    ).all()

    count = len(expired_sessions)

    for session in expired_sessions:
        db.delete(session)

    db.commit()

    return {"message": f"Cleaned up {count} expired sessions"}
