from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.core.database import get_db
from app.models import Session as SessionModel, User, Document, AudioRecording, JournalEntry, Conversation, SessionCollaborator
from app.schemas import (
    SessionCreate, SessionResponse, SessionRename, SessionShareRequest,
    SessionShareResponse, UserExistsResponse, CollaboratorInfo
)
from datetime import datetime, timedelta
from app.core.config import settings
from app.api.auth import get_current_user
from app.api.permissions import check_session_access
from app.services.s3_service import s3_service
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/", response_model=list[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all sessions for the authenticated user (owned and shared)"""
    # Get sessions where user is owner or collaborator
    owned_sessions = db.query(SessionModel).filter(
        SessionModel.user_id == current_user.id
    ).all()

    # Get sessions where user is a collaborator
    collaborator_records = db.query(SessionCollaborator).filter(
        SessionCollaborator.user_id == current_user.id
    ).all()

    shared_session_ids = [c.session_id for c in collaborator_records]
    shared_sessions = db.query(SessionModel).filter(
        SessionModel.id.in_(shared_session_ids)
    ).all() if shared_session_ids else []

    # Combine and deduplicate
    all_sessions = {s.id: s for s in owned_sessions}
    for s in shared_sessions:
        if s.id not in all_sessions:
            all_sessions[s.id] = s

    # Batch load all collaborators for all sessions in ONE query (fixes N+1)
    session_ids = list(all_sessions.keys())
    all_collaborators = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id.in_(session_ids)
    ).all() if session_ids else []

    # Batch load all collaborator users in ONE query (fixes N+1)
    collaborator_user_ids = list(set(c.user_id for c in all_collaborators))
    collaborator_users = db.query(User).filter(
        User.id.in_(collaborator_user_ids)
    ).all() if collaborator_user_ids else []
    users_by_id = {u.id: u for u in collaborator_users}

    # Group collaborators by session_id
    collaborators_by_session = {}
    for collab in all_collaborators:
        if collab.session_id not in collaborators_by_session:
            collaborators_by_session[collab.session_id] = []
        collaborators_by_session[collab.session_id].append(collab)

    # Build response with collaborator information
    response = []
    for session in sorted(all_sessions.values(), key=lambda x: x.created_at, reverse=True):
        collaborator_infos = []
        for collab in collaborators_by_session.get(session.id, []):
            collab_user = users_by_id.get(collab.user_id)
            if collab_user:
                collaborator_infos.append(CollaboratorInfo(
                    user_id=collab_user.id,
                    email=collab_user.email,
                    name=collab_user.name,
                    added_at=collab.added_at
                ))

        session_response = SessionResponse(
            id=session.id,
            name=session.name,
            created_at=session.created_at,
            last_activity=session.last_activity,
            is_active=session.is_active,
            owner_id=session.owner_id,
            is_owner=(session.owner_id == current_user.id),
            collaborators=collaborator_infos
        )
        response.append(session_response)

    return response


@router.post("/", response_model=SessionResponse)
async def create_session(
    session_data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new session for the authenticated user (max 3 sessions per user)"""
    # Check session limit (count owned sessions + collaborations)
    owned_session_count = db.query(func.count(SessionModel.id)).filter(
        SessionModel.user_id == current_user.id
    ).scalar()

    # Count collaborations
    collaboration_count = db.query(func.count(SessionCollaborator.id)).filter(
        SessionCollaborator.user_id == current_user.id
    ).scalar()

    total_session_count = owned_session_count + collaboration_count

    if total_session_count >= 3:
        raise HTTPException(
            status_code=400,
            detail="Maximum of 3 sessions allowed (including collaborations). Please delete a session or leave a collaboration in Settings → Manage Sessions before creating a new one."
        )

    # Generate default name if not provided
    if not session_data.name:
        # Find the next available session number
        existing_sessions = db.query(SessionModel).filter(
            SessionModel.user_id == current_user.id
        ).order_by(SessionModel.created_at).all()

        # Get all existing session numbers from names like "Session 1", "Session 2", etc.
        used_numbers = set()
        for session in existing_sessions:
            if session.name.startswith("Session "):
                try:
                    num = int(session.name.split("Session ")[1])
                    used_numbers.add(num)
                except (ValueError, IndexError):
                    pass

        # Find the smallest available number starting from 1
        next_number = 1
        while next_number in used_numbers:
            next_number += 1

        default_name = f"Session {next_number}"
    else:
        default_name = session_data.name

    new_session = SessionModel(
        user_id=current_user.id,
        owner_id=current_user.id,
        name=default_name
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # Set this as the user's last active session
    current_user.last_active_session_id = new_session.id
    db.commit()

    return SessionResponse(
        id=new_session.id,
        name=new_session.name,
        created_at=new_session.created_at,
        last_activity=new_session.last_activity,
        is_active=new_session.is_active,
        owner_id=new_session.owner_id,
        is_owner=True,
        collaborators=[]
    )


@router.post("/primary", response_model=SessionResponse)
async def get_or_create_primary_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get or create the user's primary (long-running) session"""
    # Check if user already has a primary session
    primary_session = db.query(SessionModel).filter(
        SessionModel.user_id == current_user.id,
        SessionModel.is_primary == True
    ).first()

    if primary_session:
        # Update last activity
        primary_session.last_activity = datetime.utcnow()
        db.commit()
        db.refresh(primary_session)

        # Get collaborators for response
        collaborators = db.query(SessionCollaborator).filter(
            SessionCollaborator.session_id == primary_session.id
        ).all()

        collaborator_infos = []
        for collab in collaborators:
            collab_user = db.query(User).filter(User.id == collab.user_id).first()
            if collab_user:
                collaborator_infos.append(CollaboratorInfo(
                    user_id=collab_user.id,
                    email=collab_user.email,
                    name=collab_user.name,
                    added_at=collab.added_at
                ))

        return SessionResponse(
            id=primary_session.id,
            name=primary_session.name,
            created_at=primary_session.created_at,
            last_activity=primary_session.last_activity,
            is_active=primary_session.is_active,
            owner_id=primary_session.owner_id,
            is_owner=True,
            collaborators=collaborator_infos
        )

    # Create new primary session
    new_primary_session = SessionModel(
        user_id=current_user.id,
        owner_id=current_user.id,
        is_primary=True
    )
    db.add(new_primary_session)
    db.commit()
    db.refresh(new_primary_session)

    return SessionResponse(
        id=new_primary_session.id,
        name=new_primary_session.name,
        created_at=new_primary_session.created_at,
        last_activity=new_primary_session.last_activity,
        is_active=new_primary_session.is_active,
        owner_id=new_primary_session.owner_id,
        is_owner=True,
        collaborators=[]
    )


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

    # Verify user has access (owner or collaborator)
    is_owner = session.owner_id == current_user.id
    is_collaborator = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == current_user.id
    ).first() is not None

    if not (is_owner or is_collaborator):
        raise HTTPException(status_code=403, detail="Access denied")

    # Update last activity
    session.last_activity = datetime.utcnow()

    # Update user's last active session
    current_user.last_active_session_id = session_id

    db.commit()

    # Get collaborators for response
    collaborators = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session.id
    ).all()

    collaborator_infos = []
    for collab in collaborators:
        collab_user = db.query(User).filter(User.id == collab.user_id).first()
        if collab_user:
            collaborator_infos.append(CollaboratorInfo(
                user_id=collab_user.id,
                email=collab_user.email,
                name=collab_user.name,
                added_at=collab.added_at
            ))

    return SessionResponse(
        id=session.id,
        name=session.name,
        created_at=session.created_at,
        last_activity=session.last_activity,
        is_active=session.is_active,
        owner_id=session.owner_id,
        is_owner=is_owner,
        collaborators=collaborator_infos
    )


@router.patch("/{session_id}/rename", response_model=SessionResponse)
async def rename_session(
    session_id: str,
    rename_data: SessionRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename a session (owner only)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can rename
    check_session_access(session, current_user.id, db, require_owner=True)

    session.name = rename_data.name
    db.commit()
    db.refresh(session)

    # Get collaborators for response
    collaborators = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session.id
    ).all()

    collaborator_infos = []
    for collab in collaborators:
        collab_user = db.query(User).filter(User.id == collab.user_id).first()
        if collab_user:
            collaborator_infos.append(CollaboratorInfo(
                user_id=collab_user.id,
                email=collab_user.email,
                name=collab_user.name,
                added_at=collab.added_at
            ))

    return SessionResponse(
        id=session.id,
        name=session.name,
        created_at=session.created_at,
        last_activity=session.last_activity,
        is_active=session.is_active,
        owner_id=session.owner_id,
        is_owner=True,
        collaborators=collaborator_infos
    )


@router.get("/{session_id}/statistics")
async def get_session_statistics(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get statistics about session data (documents, journal entries, audio recordings, conversations)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify user has access (owner or collaborator)
    check_session_access(session, current_user.id, db)

    # Count journal entries
    journal_count = db.query(func.count(JournalEntry.id)).filter(
        JournalEntry.session_id == session_id
    ).scalar()

    # Count documents
    document_count = db.query(func.count(Document.id)).filter(
        Document.session_id == session_id
    ).scalar()

    # Count audio recordings
    audio_count = db.query(func.count(AudioRecording.id)).filter(
        AudioRecording.session_id == session_id
    ).scalar()

    # Count conversations/messages
    conversation_count = db.query(func.count(Conversation.id)).filter(
        Conversation.session_id == session_id
    ).scalar()

    return {
        "session_id": session_id,
        "journal_entries": journal_count,
        "documents": document_count,
        "audio_recordings": audio_count,
        "conversations": conversation_count
    }


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a session and all associated data (owner only)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can delete
    check_session_access(session, current_user.id, db, require_owner=True)

    # Delete all documents and their thumbnails from S3 before deleting session
    documents = db.query(Document).filter(Document.session_id == session_id).all()
    for doc in documents:
        # Delete main document file
        try:
            await s3_service.delete_file(doc.s3_key)
            logger.info(f"Deleted S3 file: {doc.s3_key}")
        except Exception as e:
            logger.error(f"Failed to delete S3 file {doc.s3_key}: {str(e)}")
            # Continue deleting other files even if one fails

        # Delete thumbnail file if it exists
        if doc.thumbnail_s3_key:
            try:
                await s3_service.delete_file(doc.thumbnail_s3_key)
                logger.info(f"Deleted S3 thumbnail: {doc.thumbnail_s3_key}")
            except Exception as e:
                logger.error(f"Failed to delete S3 thumbnail {doc.thumbnail_s3_key}: {str(e)}")

    # Delete all audio recordings from S3
    audio_recordings = db.query(AudioRecording).filter(AudioRecording.session_id == session_id).all()
    for audio in audio_recordings:
        try:
            await s3_service.delete_file(audio.s3_key)
            logger.info(f"Deleted S3 audio file: {audio.s3_key}")
        except Exception as e:
            logger.error(f"Failed to delete S3 audio file {audio.s3_key}: {str(e)}")

    # This will cascade delete all database records (documents, conversations, journal entries,
    # audio recordings, daily plans) but keep the user account
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

    # Only owner can cleanup session
    check_session_access(session, current_user.id, db, require_owner=True)

    session.is_active = False
    db.commit()

    return {"message": "Session marked as inactive"}


@router.post("/{session_id}/check-user", response_model=UserExistsResponse)
async def check_user_exists(
    session_id: str,
    email_data: SessionShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if a user exists by email and can be added to the session"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can share
    check_session_access(session, current_user.id, db, require_owner=True)

    # Look up user by email
    target_user = db.query(User).filter(User.email == email_data.email).first()

    if not target_user:
        return UserExistsResponse(
            exists=False,
            message="No AretaCare account found with this email address."
        )

    # Check if user is already the owner
    if target_user.id == session.owner_id:
        return UserExistsResponse(
            exists=False,
            message="This is your own session. You cannot share it with yourself."
        )

    # Check if user is already a collaborator
    existing_collab = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == target_user.id
    ).first()

    if existing_collab:
        return UserExistsResponse(
            exists=False,
            message=f"{target_user.name} is already a collaborator on this session."
        )

    # Count user's current sessions (owned + collaborations)
    user_owned_count = db.query(func.count(SessionModel.id)).filter(
        SessionModel.user_id == target_user.id
    ).scalar()

    user_collab_count = db.query(func.count(SessionCollaborator.id)).filter(
        SessionCollaborator.user_id == target_user.id
    ).scalar()

    user_total_sessions = user_owned_count + user_collab_count

    if user_total_sessions >= 3:
        return UserExistsResponse(
            exists=False,
            message=f"{target_user.name} already has 3 active sessions. They must delete or leave a session before joining this one."
        )

    return UserExistsResponse(
        exists=True,
        user_id=target_user.id,
        name=target_user.name,
        message=None
    )


@router.post("/{session_id}/share", response_model=SessionShareResponse)
async def share_session(
    session_id: str,
    share_data: SessionShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Share a session with another user"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can share
    check_session_access(session, current_user.id, db, require_owner=True)

    # Check collaborator limit (max 5 total including owner means max 4 additional collaborators)
    current_collab_count = db.query(func.count(SessionCollaborator.id)).filter(
        SessionCollaborator.session_id == session_id
    ).scalar()

    if current_collab_count >= 4:
        raise HTTPException(
            status_code=400,
            detail="Maximum of 5 people (including owner) can collaborate on a session. Please remove a collaborator first."
        )

    # Look up user by email
    target_user = db.query(User).filter(User.email == share_data.email).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if user is the owner
    if target_user.id == session.owner_id:
        raise HTTPException(status_code=400, detail="Cannot share session with yourself")

    # Check if already a collaborator
    existing_collab = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == target_user.id
    ).first()

    if existing_collab:
        raise HTTPException(status_code=400, detail="User is already a collaborator")

    # Check target user's session count
    user_owned_count = db.query(func.count(SessionModel.id)).filter(
        SessionModel.user_id == target_user.id
    ).scalar()

    user_collab_count = db.query(func.count(SessionCollaborator.id)).filter(
        SessionCollaborator.user_id == target_user.id
    ).scalar()

    if user_owned_count + user_collab_count >= 3:
        raise HTTPException(
            status_code=400,
            detail="Target user already has 3 active sessions"
        )

    # Create collaboration
    new_collab = SessionCollaborator(
        id=str(uuid.uuid4()),
        session_id=session_id,
        user_id=target_user.id
    )
    db.add(new_collab)
    db.commit()
    db.refresh(new_collab)

    # Get owner information
    owner = db.query(User).filter(User.id == session.owner_id).first()

    # Send email notifications
    # 1. Notify the owner that a collaborator was added
    if owner:
        from app.services.email_service import email_service
        email_service.send_collaborator_added_to_owner_email(
            owner_email=owner.email,
            owner_name=owner.name,
            session_name=session.name,
            collaborator_name=target_user.name,
            collaborator_email=target_user.email
        )

    # 2. Notify the new collaborator that they were added
    if owner:
        email_service.send_collaborator_invitation_email(
            collaborator_email=target_user.email,
            collaborator_name=target_user.name,
            session_name=session.name,
            owner_name=owner.name
        )

    collaborator_info = CollaboratorInfo(
        user_id=target_user.id,
        email=target_user.email,
        name=target_user.name,
        added_at=new_collab.added_at
    )

    return SessionShareResponse(
        success=True,
        message=f"Session shared with {target_user.name}",
        collaborator=collaborator_info
    )


@router.delete("/{session_id}/collaborators/{user_id}")
async def revoke_access(
    session_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke a collaborator's access to a session (owner only)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can revoke access
    check_session_access(session, current_user.id, db, require_owner=True)

    # Find collaboration
    collab = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == user_id
    ).first()

    if not collab:
        raise HTTPException(status_code=404, detail="Collaborator not found")

    # Get collaborator and owner information before deletion
    collaborator = db.query(User).filter(User.id == user_id).first()
    owner = db.query(User).filter(User.id == session.owner_id).first()

    # Delete collaboration
    db.delete(collab)
    db.commit()

    # Send email notification to removed collaborator
    if collaborator and owner:
        from app.services.email_service import email_service
        email_service.send_collaborator_removed_email(
            collaborator_email=collaborator.email,
            collaborator_name=collaborator.name,
            session_name=session.name,
            owner_name=owner.name,
            owner_email=owner.email
        )

    return {"message": "Access revoked successfully"}


@router.post("/{session_id}/leave")
async def leave_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Leave a shared session (collaborators only)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if user is the owner
    if session.owner_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Session owners cannot leave. You must delete the session instead."
        )

    # Find and delete collaboration
    collab = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == current_user.id
    ).first()

    if not collab:
        raise HTTPException(status_code=404, detail="You are not a collaborator on this session")

    db.delete(collab)
    db.commit()

    return {"message": "Left session successfully"}
