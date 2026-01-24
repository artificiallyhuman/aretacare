from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Session as SessionModel, AudioRecording
from app.schemas.audio_recording import AudioRecordingResponse, AudioRecordingListResponse, AudioRecordingUpdate
from app.services.s3_service import s3_service
from app.api.auth import get_current_user
from app.api.permissions import check_session_access
from app.api.source_tags import session_has_collaborators, build_source_tag_info, get_user_map
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audio-recordings", tags=["audio-recordings"])


@router.get("/{session_id}", response_model=AudioRecordingListResponse)
async def get_audio_recordings(
    session_id: str,
    category: str = None,
    search: str = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get audio recordings for a session with optional filtering, search, and pagination"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

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

    # Get total count before pagination
    total = query.count()

    # Get recordings ordered by date with pagination
    recordings = query.order_by(AudioRecording.created_at.desc()).offset(offset).limit(limit).all()

    # Check if session has collaborators (for source tag attribution)
    has_collaborators = session_has_collaborators(session_id, db)

    # Build response with source tags if session has collaborators
    rec_responses = []
    if has_collaborators:
        # Batch load user info for source tags
        user_ids = []
        for rec in recordings:
            if rec.created_by_user_id:
                user_ids.append(rec.created_by_user_id)
            if rec.last_edited_by_user_id:
                user_ids.append(rec.last_edited_by_user_id)
        user_map = get_user_map(user_ids, db)

        for rec in recordings:
            rec_dict = {
                "id": rec.id,
                "session_id": rec.session_id,
                "filename": rec.filename,
                "s3_key": rec.s3_key,
                "duration": rec.duration,
                "transcribed_text": rec.transcribed_text,
                "category": rec.category.value if rec.category else None,
                "ai_summary": rec.ai_summary,
                "created_at": rec.created_at,
                "created_by": build_source_tag_info(user_map.get(rec.created_by_user_id)) if rec.created_by_user_id else None,
                "last_edited_by": build_source_tag_info(user_map.get(rec.last_edited_by_user_id)) if rec.last_edited_by_user_id else None
            }
            rec_responses.append(rec_dict)
    else:
        # No collaborators, just convert recordings to response format
        for rec in recordings:
            rec_dict = {
                "id": rec.id,
                "session_id": rec.session_id,
                "filename": rec.filename,
                "s3_key": rec.s3_key,
                "duration": rec.duration,
                "transcribed_text": rec.transcribed_text,
                "category": rec.category.value if rec.category else None,
                "ai_summary": rec.ai_summary,
                "created_at": rec.created_at,
                "created_by": None,
                "last_edited_by": None
            }
            rec_responses.append(rec_dict)

    return {
        "recordings": rec_responses,
        "has_more": (offset + len(recordings)) < total,
        "total": total
    }


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
    check_session_access(session, current_user.id, db)

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
    """Update an audio recording's AI summary and/or category"""
    from app.models import AudioRecordingCategory

    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

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

    # Update category
    if update_data.category is not None:
        try:
            recording.category = AudioRecordingCategory(update_data.category)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {update_data.category}")

    # Track editor for collaborative sessions
    recording.last_edited_by_user_id = current_user.id

    db.commit()
    db.refresh(recording)

    # Build source tags for response if session has collaborators
    has_collaborators = session_has_collaborators(session_id, db)
    if has_collaborators:
        user_ids = [uid for uid in [recording.created_by_user_id, recording.last_edited_by_user_id] if uid]
        user_map = get_user_map(user_ids, db)

        return {
            "id": recording.id,
            "session_id": recording.session_id,
            "filename": recording.filename,
            "s3_key": recording.s3_key,
            "duration": recording.duration,
            "transcribed_text": recording.transcribed_text,
            "category": recording.category.value if recording.category else None,
            "ai_summary": recording.ai_summary,
            "created_at": recording.created_at,
            "created_by": build_source_tag_info(user_map.get(recording.created_by_user_id)) if recording.created_by_user_id else None,
            "last_edited_by": build_source_tag_info(user_map.get(recording.last_edited_by_user_id)) if recording.last_edited_by_user_id else None
        }

    return recording


@router.delete("/{session_id}/{recording_id}")
async def delete_audio_recording(
    session_id: str,
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an audio recording and its associated journal entries"""
    from app.models.journal import JournalEntry

    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

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

    # Delete associated journal entries (cascade should handle this, but explicit for clarity)
    db.query(JournalEntry).filter(JournalEntry.source_audio_id == recording_id).delete()

    # Delete from database
    db.delete(recording)
    db.commit()

    return {"message": "Recording and associated journal entries deleted successfully"}


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
    check_session_access(session, current_user.id, db)

    # Get the recording
    recording = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id
    ).first()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Generate presigned URL (4 hour expiration for audio playback)
    url = s3_service.generate_presigned_url(recording.s3_key, expiration=14400)

    return {"url": url}
