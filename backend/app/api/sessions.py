from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Session as SessionModel
from app.schemas import SessionCreate, SessionResponse
from datetime import datetime, timedelta
from app.core.config import settings

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/", response_model=SessionResponse)
async def create_session(db: Session = Depends(get_db)):
    """Create a new session for a user"""
    new_session = SessionModel()
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get session details"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update last activity
    session.last_activity = datetime.utcnow()
    db.commit()

    return session


@router.delete("/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a session and all associated data"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # This will cascade delete all documents and conversations
    db.delete(session)
    db.commit()

    return {"message": "Session deleted successfully"}


@router.post("/{session_id}/cleanup")
async def cleanup_session(session_id: str, db: Session = Depends(get_db)):
    """Mark session as inactive (for privacy, keeping data temporarily for session)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

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
