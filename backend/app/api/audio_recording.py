from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rate_limit import limiter, RateLimits
from app.models import User, Session as SessionModel, AudioRecording
from app.models.audio_recording import TranscriptionStatus
from app.schemas.audio_recording import AudioRecordingResponse, AudioRecordingListResponse, AudioRecordingUpdate
from app.services.s3_service import s3_service
from app.api.auth import get_current_user, require_ai_data_sharing_consent
from app.api.permissions import check_session_access
from app.api.source_tags import session_has_collaborators, build_source_tag_info, get_user_map
from app.services.audio_transcription_service import (
    effective_transcription_status,
    is_original_upload_key,
    mp3_key_for,
    start_transcription_job,
)
from typing import List, Optional
from datetime import datetime
import logging
import os
import tempfile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audio-recordings", tags=["audio-recordings"])


def _recording_to_dict(rec: AudioRecording, user_map: Optional[dict] = None) -> dict:
    """Single serializer for every audio recording response.

    `user_map` is None when the session has no collaborators — source tags are
    then omitted even if the row records a creator, matching the pre-existing
    behaviour. `transcription_status` is the *effective* status (a 'processing'
    row with a stale heartbeat is reported as 'failed').
    """
    return {
        "id": rec.id,
        "session_id": rec.session_id,
        "filename": rec.filename,
        "s3_key": rec.s3_key,
        "duration": rec.duration,
        "transcribed_text": rec.transcribed_text,
        "category": rec.category.value if rec.category else None,
        "ai_summary": rec.ai_summary,
        "created_at": rec.created_at,
        "transcription_status": effective_transcription_status(rec),
        "created_by": (
            build_source_tag_info(user_map.get(rec.created_by_user_id))
            if user_map is not None and rec.created_by_user_id else None
        ),
        "last_edited_by": (
            build_source_tag_info(user_map.get(rec.last_edited_by_user_id))
            if user_map is not None and rec.last_edited_by_user_id else None
        ),
    }


def _user_map_for(recording: AudioRecording, session_id: str, db: Session) -> Optional[dict]:
    """Source-tag user lookup for a single recording; None when the session is not shared."""
    if not session_has_collaborators(session_id, db):
        return None
    user_ids = [uid for uid in [recording.created_by_user_id, recording.last_edited_by_user_id] if uid]
    return get_user_map(user_ids, db)


@router.get("/{session_id}", response_model=AudioRecordingListResponse)
async def get_audio_recordings(
    session_id: str,
    category: str = None,
    search: str = Query(None, max_length=100),
    date: str = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get audio recordings for a session with optional filtering, search, and pagination"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
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

    # Filter by date if provided
    if date:
        from datetime import date as date_type
        from sqlalchemy import cast
        from sqlalchemy import Date as SQLDate
        try:
            parsed_date = date_type.fromisoformat(date)
            query = query.filter(cast(AudioRecording.created_at, SQLDate) == parsed_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format (use YYYY-MM-DD)")

    # Get total count before pagination
    total = query.count()

    # Get recordings ordered by date with pagination
    recordings = query.order_by(AudioRecording.created_at.desc()).offset(offset).limit(limit).all()

    # Check if session has collaborators (for source tag attribution)
    has_collaborators = session_has_collaborators(session_id, db)

    # Batch load user info for source tags if the session is shared
    user_map = None
    if has_collaborators:
        user_ids = []
        for rec in recordings:
            if rec.created_by_user_id:
                user_ids.append(rec.created_by_user_id)
            if rec.last_edited_by_user_id:
                user_ids.append(rec.last_edited_by_user_id)
        user_map = get_user_map(user_ids, db)

    rec_responses = [_recording_to_dict(rec, user_map) for rec in recordings]

    return {
        "recordings": rec_responses,
        "has_more": (offset + len(recordings)) < total,
        "total": total
    }


@router.get("/{session_id}/dates")
async def get_audio_recording_dates(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all distinct dates that have audio recordings, with counts."""
    from sqlalchemy import func, desc, cast
    from sqlalchemy import Date as SQLDate

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    date_col = cast(AudioRecording.created_at, SQLDate)
    rows = (
        db.query(
            date_col.label("recording_date"),
            func.count(AudioRecording.id).label("entry_count")
        )
        .filter(AudioRecording.session_id == session_id)
        .group_by(date_col)
        .order_by(desc(date_col))
        .all()
    )

    return {
        "dates": [
            {"date": row.recording_date.isoformat(), "entry_count": row.entry_count}
            for row in rows
        ]
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
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    # Get the recording
    recording = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id
    ).first()

    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    return _recording_to_dict(recording, _user_map_for(recording, session_id, db))


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
        raise HTTPException(status_code=404, detail="Care session not found")
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

    return _recording_to_dict(recording, _user_map_for(recording, session_id, db))


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
        raise HTTPException(status_code=404, detail="Care session not found")
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
@limiter.limit(RateLimits.PRESIGNED_URL)
async def get_audio_url(
    request: Request,
    session_id: str,
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a presigned URL for playing the audio recording"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
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


@router.post("/{session_id}/{recording_id}/retranscribe", status_code=202)
@limiter.limit(RateLimits.AUDIO_UPLOAD)
async def retranscribe_audio_recording(
    request: Request,
    session_id: str,
    recording_id: int,
    current_user: User = Depends(require_ai_data_sharing_consent),
    db: Session = Depends(get_db)
):
    """Re-run transcription for a recording whose background job failed.

    Covers every way a job can be lost — OpenAI outage, deploy/SIGKILL mid-job,
    autoscale-down, a stale heartbeat — without re-uploading (an in-app recording
    is discarded client-side as soon as the upload returns). Fetches the stored
    object back from S3 and launches the same job the upload uses; a row still on
    its `.original.<ext>` key is transcoded and swapped like a fresh upload.
    """
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    recording = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id
    ).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if effective_transcription_status(recording) != TranscriptionStatus.FAILED.value:
        raise HTTPException(status_code=409, detail="This recording is not waiting for a retry.")

    source_key = recording.s3_key
    original_filename = recording.filename
    duration = recording.duration
    source_is_mp3 = not is_original_upload_key(source_key)
    mp3_key = mp3_key_for(source_key)
    original_name = original_filename.rsplit('.', 1)[0] if '.' in original_filename else original_filename
    suffix = os.path.splitext(source_key)[1] or '.mp3'

    temp_fd, temp_path = tempfile.mkstemp(suffix=suffix)
    os.close(temp_fd)
    if not await s3_service.download_file_to_path(source_key, temp_path):
        os.unlink(temp_path)
        raise HTTPException(status_code=500, detail="Could not fetch the recording for retranscription. Please try again.")

    # Claim the row atomically so two clicks (or two instances) can't both pick it up.
    # 'processing' is only accepted here because the effective status above already
    # established that its heartbeat is stale.
    claimed = db.query(AudioRecording).filter(
        AudioRecording.id == recording_id,
        AudioRecording.session_id == session_id,
        AudioRecording.transcription_status.in_([
            TranscriptionStatus.FAILED.value, TranscriptionStatus.PROCESSING.value
        ]),
    ).update({
        "transcription_status": TranscriptionStatus.PROCESSING.value,
        "transcription_updated_at": datetime.utcnow(),
    }, synchronize_session=False)
    db.commit()
    if claimed == 0:
        os.unlink(temp_path)
        raise HTTPException(status_code=409, detail="This recording is already being transcribed.")

    start_transcription_job(
        recording_id=recording_id,
        session_id=session_id,
        user_id=current_user.id,
        source_temp_path=temp_path,
        source_key=source_key,
        mp3_key=mp3_key,
        source_is_mp3=source_is_mp3,
        original_name=original_name,
        original_filename=original_filename,
        skip_synthesis=False,
        use_semaphore=True,
    )
    logger.info(f"Retranscription started for audio recording {recording_id} (source: {source_key})")

    return {
        "recording_id": recording_id,
        "filename": original_filename,
        "duration": duration,
        "audio_s3_key": source_key,
        "transcription_status": TranscriptionStatus.PROCESSING.value,
        "transcribed_text": None,
    }
