from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Session as SessionModel, AudioRecording
from app.schemas.audio_recording import AudioRecordingResponse, AudioRecordingListResponse, AudioRecordingUpdate
from app.services.s3_service import s3_service
from app.api.auth import get_current_user
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audio-recordings", tags=["audio-recordings"])


@router.get("/{session_id}", response_model=AudioRecordingListResponse)
async def get_audio_recordings(
    session_id: str,
    category: str = None,
    search: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all audio recordings for a session with optional filtering and search"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Build query with filters
    query = db.query(AudioRecording).filter(AudioRecording.session_id == session_id)

    # Filter by category if provided
    if category and category != "all":
        try:
            from app.models import AudioRecordingCategory
            cat_enum = AudioRecordingCategory(category)
            query = query.filter(AudioRecording.category == cat_enum)
        except ValueError:
            # Invalid category, ignore filter
            pass

    # Search by AI summary or transcribed text if provided
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (AudioRecording.ai_summary.ilike(search_term)) |
            (AudioRecording.transcribed_text.ilike(search_term))
        )

    # Get recordings ordered by date
    recordings = query.order_by(AudioRecording.created_at.desc()).all()

    return {"recordings": recordings}


@router.get("/{session_id}/{recording_id}", response_model=AudioRecordingResponse)
async def get_audio_recording(
    session_id: str,
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific audio recording with presigned URL"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get the recording
    recording = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id
    ).first()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    return recording


@router.patch("/{session_id}/{recording_id}", response_model=AudioRecordingResponse)
async def update_audio_recording(
    session_id: str,
    recording_id: int,
    update_data: AudioRecordingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an audio recording's AI summary"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get the recording
    recording = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id
    ).first()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Update AI summary
    if update_data.ai_summary is not None:
        recording.ai_summary = update_data.ai_summary

    db.commit()
    db.refresh(recording)

    return recording


@router.delete("/{session_id}/{recording_id}")
async def delete_audio_recording(
    session_id: str,
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an audio recording"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get the recording
    recording = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id
    ).first()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Delete from S3
    try:
        await s3_service.delete_file(recording.s3_key)
        logger.info(f"Deleted audio file from S3: {recording.s3_key}")
    except Exception as e:
        logger.error(f"Failed to delete audio file from S3: {str(e)}")
        # Continue with database deletion even if S3 deletion fails

    # Delete from database
    db.delete(recording)
    db.commit()

    return {"message": "Recording deleted successfully"}


@router.get("/{session_id}/{recording_id}/url")
async def get_audio_url(
    session_id: str,
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a presigned URL for playing the audio recording"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get the recording
    recording = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id
    ).first()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Generate presigned URL (24 hour expiration)
    url = s3_service.generate_presigned_url(recording.s3_key, expiration=86400)

    return {"url": url}
