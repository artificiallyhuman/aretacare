from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.core.database import get_db
from app.models import Session as SessionModel, User, Document, AudioRecording, JournalEntry, Conversation, SessionCollaborator, PendingInvitation, WaitlistEntry
from app.schemas import (
    SessionCreate, SessionResponse, SessionRename, SessionShareRequest,
    SessionShareResponse, UserExistsResponse, CollaboratorInfo, TransferOwnershipRequest
)
from app.schemas.invitation import InvitationSend, PendingInvitationResponse
from datetime import datetime, timedelta
from app.core.config import settings
from app.api.auth import get_current_user
from app.api.permissions import check_session_access
from app.services.s3_service import s3_service
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_unique_session_name(base_name: str, user_id: str, db: Session, exclude_session_id: str = None) -> str:
    """
    Generate a unique session name for a user's owned sessions.
    If base_name already exists, appends (2), (3), etc.
    """
    # Get all owned session names for this user
    query = db.query(SessionModel.name).filter(SessionModel.user_id == user_id)
    if exclude_session_id:
        query = query.filter(SessionModel.id != exclude_session_id)
    existing_names = {s.name for s in query.all()}

    # If name doesn't exist, use it as-is
    if base_name not in existing_names:
        return base_name

    # Find the next available suffix
    counter = 2
    while f"{base_name} ({counter})" in existing_names:
        counter += 1

    return f"{base_name} ({counter})"


def build_collaborator_infos(collaborators, db: Session) -> list[CollaboratorInfo]:
    """
    Build list of CollaboratorInfo objects with owned session counts.
    Batch queries to avoid N+1 problem.
    """
    if not collaborators:
        return []

    # Batch load all collaborator users
    user_ids = [c.user_id for c in collaborators]
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    users_by_id = {u.id: u for u in users}

    # Batch load owned session counts
    owned_counts = db.query(
        SessionModel.user_id,
        func.count(SessionModel.id).label('count')
    ).filter(
        SessionModel.user_id.in_(user_ids)
    ).group_by(SessionModel.user_id).all()
    owned_counts_by_user = {user_id: count for user_id, count in owned_counts}

    # Build collaborator infos
    collaborator_infos = []
    for collab in collaborators:
        user = users_by_id.get(collab.user_id)
        if user:
            collaborator_infos.append(CollaboratorInfo(
                user_id=user.id,
                email=user.email,
                name=user.name,
                added_at=collab.added_at,
                owned_session_count=owned_counts_by_user.get(user.id, 0)
            ))

    return collaborator_infos


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

    # Batch load owned session counts for all collaborators in ONE query (fixes N+1)
    owned_counts = db.query(
        SessionModel.user_id,
        func.count(SessionModel.id).label('count')
    ).filter(
        SessionModel.user_id.in_(collaborator_user_ids)
    ).group_by(SessionModel.user_id).all() if collaborator_user_ids else []
    owned_counts_by_user = {user_id: count for user_id, count in owned_counts}

    # Group collaborators by session_id
    collaborators_by_session = {}
    for collab in all_collaborators:
        if collab.session_id not in collaborators_by_session:
            collaborators_by_session[collab.session_id] = []
        collaborators_by_session[collab.session_id].append(collab)

    # Batch load owner names for all sessions
    owner_ids = list(set(s.owner_id for s in all_sessions.values()))
    owners = db.query(User).filter(User.id.in_(owner_ids)).all() if owner_ids else []
    owners_by_id = {o.id: o for o in owners}

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
                    added_at=collab.added_at,
                    owned_session_count=owned_counts_by_user.get(collab_user.id, 0)
                ))

        # Get owner name and email
        owner = owners_by_id.get(session.owner_id)
        owner_name = owner.name if owner else ""
        owner_email = owner.email if owner else ""

        session_response = SessionResponse(
            id=session.id,
            name=session.name,
            created_at=session.created_at,
            last_activity=session.last_activity,
            is_active=session.is_active,
            owner_id=session.owner_id,
            owner_name=owner_name,
            owner_email=owner_email,
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
    """Create a new session for the authenticated user (max 5 owned sessions per user)"""
    # Check session limit (count only owned sessions, not collaborations)
    owned_session_count = db.query(func.count(SessionModel.id)).filter(
        SessionModel.user_id == current_user.id
    ).scalar()

    if owned_session_count >= 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum of 5 owned sessions allowed. Please delete a session in Settings → Manage Sessions before creating a new one."
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
        raise HTTPException(
            status_code=403,
            detail={"message": "Access denied", "code": "SESSION_ACCESS_DENIED"}
        )

    # Update last activity
    session.last_activity = datetime.utcnow()

    # Update user's last active session
    current_user.last_active_session_id = session_id

    db.commit()

    # Get collaborators for response
    collaborators = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session.id
    ).all()

    collaborator_infos = build_collaborator_infos(collaborators, db)

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

    # Check if another owned session already has this name
    existing_session = db.query(SessionModel).filter(
        SessionModel.user_id == current_user.id,
        SessionModel.name == rename_data.name,
        SessionModel.id != session_id
    ).first()

    if existing_session:
        raise HTTPException(
            status_code=400,
            detail=f"You already have a session named \"{rename_data.name}\". Please choose a different name."
        )

    session.name = rename_data.name
    db.commit()
    db.refresh(session)

    # Get collaborators for response
    collaborators = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session.id
    ).all()

    collaborator_infos = build_collaborator_infos(collaborators, db)

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

    # Collect all S3 keys BEFORE deleting DB records
    # This ensures we don't lose track of files if DB deletion succeeds
    s3_keys_to_delete = []

    # Collect document S3 keys (main files and thumbnails)
    documents = db.query(Document.s3_key, Document.thumbnail_s3_key).filter(
        Document.session_id == session_id
    ).all()
    for doc in documents:
        s3_keys_to_delete.append(doc.s3_key)
        if doc.thumbnail_s3_key:
            s3_keys_to_delete.append(doc.thumbnail_s3_key)

    # Collect audio recording S3 keys
    audio_recordings = db.query(AudioRecording.s3_key).filter(
        AudioRecording.session_id == session_id
    ).all()
    for audio in audio_recordings:
        s3_keys_to_delete.append(audio.s3_key)

    # Delete DB records first (cascades to all related records)
    # If this fails, S3 files remain and references stay consistent
    db.delete(session)
    db.commit()

    # Now delete S3 files after DB commit succeeds
    # If S3 deletion fails, files become orphans (cleaned up by admin S3 cleanup)
    for s3_key in s3_keys_to_delete:
        try:
            await s3_service.delete_file(s3_key)
            logger.info(f"Deleted S3 file: {s3_key}")
        except Exception as e:
            logger.error(f"Failed to delete S3 file {s3_key}: {str(e)}")
            # Continue deleting other files even if one fails

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

    # Check if user is trying to add themselves
    if target_user.id == current_user.id:
        return UserExistsResponse(
            exists=False,
            message="You cannot add yourself as a collaborator."
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

    # No session limit check needed - users can be collaborators on unlimited sessions
    # They just can't accept ownership if they have 5 owned sessions
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

    # Check collaborator limit (max 10 total including owner means max 9 additional)
    # Count both existing collaborators AND pending invitations
    current_collab_count = db.query(func.count(SessionCollaborator.id)).filter(
        SessionCollaborator.session_id == session_id
    ).scalar()

    pending_invite_count = db.query(func.count(PendingInvitation.id)).filter(
        PendingInvitation.session_id == session_id
    ).scalar()

    total_count = current_collab_count + pending_invite_count

    if total_count >= 9:
        raise HTTPException(
            status_code=400,
            detail="Maximum of 10 people (including owner) can collaborate on a session. Please remove a collaborator or cancel a pending invitation first."
        )

    # Look up user by email
    target_user = db.query(User).filter(User.email == share_data.email).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if user is trying to add themselves
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot add yourself as a collaborator")

    # Check if already a collaborator
    existing_collab = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == target_user.id
    ).first()

    if existing_collab:
        raise HTTPException(status_code=400, detail="User is already a collaborator")

    # No session limit check needed - users can be collaborators on unlimited sessions
    # They just can't accept ownership transfer if they have 5 owned sessions

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

    # Get owned session count for the new collaborator
    owned_count = db.query(func.count(SessionModel.id)).filter(
        SessionModel.user_id == target_user.id
    ).scalar()

    collaborator_info = CollaboratorInfo(
        user_id=target_user.id,
        email=target_user.email,
        name=target_user.name,
        added_at=new_collab.added_at,
        owned_session_count=owned_count
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


@router.post("/{session_id}/transfer-ownership", response_model=SessionResponse)
async def transfer_ownership(
    session_id: str,
    transfer_data: TransferOwnershipRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Transfer session ownership to an existing collaborator (owner only)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can transfer ownership
    check_session_access(session, current_user.id, db, require_owner=True)

    # Verify new owner is an existing collaborator
    new_owner_collab = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == transfer_data.new_owner_user_id
    ).first()

    if not new_owner_collab:
        raise HTTPException(
            status_code=400,
            detail="New owner must be an existing collaborator on this session"
        )

    # Get the new owner user
    new_owner = db.query(User).filter(User.id == transfer_data.new_owner_user_id).first()
    if not new_owner:
        raise HTTPException(status_code=404, detail="New owner user not found")

    # Check if new owner already has 5 owned sessions (they can't accept ownership)
    new_owner_session_count = db.query(func.count(SessionModel.id)).filter(
        SessionModel.user_id == new_owner.id
    ).scalar()

    if new_owner_session_count >= 5:
        raise HTTPException(
            status_code=400,
            detail=f"{new_owner.name} already has 5 owned sessions. They must delete a session before accepting ownership."
        )

    # Check for name conflict with new owner's existing sessions and auto-rename if needed
    unique_name = get_unique_session_name(session.name, new_owner.id, db)
    if unique_name != session.name:
        logger.info(f"Auto-renamed session from '{session.name}' to '{unique_name}' due to name conflict for new owner {new_owner.email}")

    # Transfer ownership
    old_owner_id = session.owner_id
    session.owner_id = new_owner.id
    session.user_id = new_owner.id  # Update user_id as well for consistency
    session.name = unique_name  # Apply the (potentially renamed) session name

    # Remove new owner from collaborators
    db.delete(new_owner_collab)

    # Add old owner as collaborator
    old_owner_as_collab = SessionCollaborator(
        id=str(uuid.uuid4()),
        session_id=session_id,
        user_id=old_owner_id
    )
    db.add(old_owner_as_collab)

    db.commit()
    db.refresh(session)

    # Get old owner info for email notifications
    old_owner = db.query(User).filter(User.id == old_owner_id).first()

    # Send email notifications
    if old_owner and new_owner:
        from app.services.email_service import email_service
        # Notify new owner that they now own the session
        email_service.send_ownership_transferred_to_new_owner_email(
            new_owner_email=new_owner.email,
            new_owner_name=new_owner.name,
            session_name=session.name,
            old_owner_name=old_owner.name
        )
        # Notify old owner that ownership was transferred
        email_service.send_ownership_transferred_from_old_owner_email(
            old_owner_email=old_owner.email,
            old_owner_name=old_owner.name,
            session_name=session.name,
            new_owner_name=new_owner.name
        )

    # Get updated collaborators for response
    collaborators = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session.id
    ).all()

    collaborator_infos = build_collaborator_infos(collaborators, db)

    return SessionResponse(
        id=session.id,
        name=session.name,
        created_at=session.created_at,
        last_activity=session.last_activity,
        is_active=session.is_active,
        owner_id=session.owner_id,
        is_owner=False,  # Current user is now a collaborator
        collaborators=collaborator_infos
    )


@router.post("/{session_id}/send-invitation")
async def send_invitation(
    session_id: str,
    invitation_data: InvitationSend,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send an invitation to a user who doesn't have an AretaCare account yet.

    When CONTROL_SIGNUPS=TRUE, adds the user to the waitlist instead of creating
    a pending invitation. The session owner will be notified when they register.
    """
    from app.services.email_service import EmailService

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can send invitations
    check_session_access(session, current_user.id, db, require_owner=True)

    # Verify user doesn't already exist
    existing_user = db.query(User).filter(User.email == invitation_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="This email is already associated with an AretaCare account. Use the normal sharing process."
        )

    # Handle waitlist mode differently
    if settings.CONTROL_SIGNUPS:
        # Normalize email for consistent comparison
        normalized_email = invitation_data.email.lower().strip()

        # Add to waitlist with referrer info instead of creating pending invitation
        existing_waitlist = db.query(WaitlistEntry).filter(
            WaitlistEntry.email == normalized_email
        ).first()

        referrer_info = {
            "user_id": current_user.id,
            "user_email": current_user.email,
            "session_name": session.name
        }

        if existing_waitlist:
            # Add referrer info if not already present
            referrers = existing_waitlist.referrers or []
            # Check if this referrer already exists
            if not any(r.get("user_id") == current_user.id and r.get("session_name") == session.name for r in referrers):
                referrers.append(referrer_info)
                existing_waitlist.referrers = referrers
                db.commit()
            return {
                "message": f"Added to waitlist. You'll be notified when {invitation_data.email} joins AretaCare.",
                "added_to_waitlist": True
            }
        else:
            # Create new waitlist entry with referrer info
            waitlist_entry = WaitlistEntry(
                email=normalized_email,
                referrers=[referrer_info],
                added_by_email=current_user.email
            )
            db.add(waitlist_entry)
            db.commit()
            return {
                "message": f"Added to waitlist. You'll be notified when {invitation_data.email} joins AretaCare.",
                "added_to_waitlist": True
            }

    # Normal flow - create pending invitation
    # Check if invitation already exists for this email/session combo
    existing_invitation = db.query(PendingInvitation).filter(
        PendingInvitation.email == invitation_data.email,
        PendingInvitation.session_id == session_id
    ).first()

    if existing_invitation:
        # Update the invitation (refresh the timestamp and token)
        # No limit check needed - we're just refreshing, not adding a new person
        existing_invitation.created_at = datetime.utcnow()
        import secrets
        existing_invitation.token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(existing_invitation)
        invitation = existing_invitation
    else:
        # Creating a NEW invitation - check collaborator limit first
        # Count both existing collaborators AND pending invitations
        current_collab_count = db.query(func.count(SessionCollaborator.id)).filter(
            SessionCollaborator.session_id == session_id
        ).scalar()

        pending_invite_count = db.query(func.count(PendingInvitation.id)).filter(
            PendingInvitation.session_id == session_id
        ).scalar()

        total_count = current_collab_count + pending_invite_count

        if total_count >= 9:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 10 people (including owner) can collaborate on a session. Please remove a collaborator or cancel a pending invitation first."
            )

        # Create new invitation
        invitation = PendingInvitation(
            email=invitation_data.email,
            session_id=session_id,
            invited_by_user_id=current_user.id
        )
        db.add(invitation)
        db.commit()
        db.refresh(invitation)

    # Send invitation email
    email_service = EmailService()
    frontend_url = settings.FRONTEND_URL or "http://localhost:3001"
    registration_url = f"{frontend_url}/register?email={invitation_data.email}&token={invitation.token}"

    email_service.send_invitation_email(
        to_email=invitation_data.email,
        inviter_name=current_user.name,
        session_name=session.name,
        registration_url=registration_url
    )

    # Calculate expiration info
    days_since_created = (datetime.utcnow() - invitation.created_at).days
    days_remaining = max(0, 30 - days_since_created)
    is_expired = days_since_created >= 30

    return PendingInvitationResponse(
        id=invitation.id,
        email=invitation.email,
        session_id=invitation.session_id,
        invited_by_name=current_user.name,
        created_at=invitation.created_at,
        days_remaining=days_remaining,
        is_expired=is_expired
    )


@router.get("/{session_id}/pending-invitations", response_model=list[PendingInvitationResponse])
async def get_pending_invitations(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all pending invitations for a session (owner only)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can view pending invitations
    check_session_access(session, current_user.id, db, require_owner=True)

    invitations = db.query(PendingInvitation).filter(
        PendingInvitation.session_id == session_id
    ).all()

    # Filter out and delete expired invitations (older than 30 days)
    now = datetime.utcnow()
    valid_invitations = []

    for invitation in invitations:
        days_since_created = (now - invitation.created_at).days
        if days_since_created >= 30:
            # Delete expired invitation
            db.delete(invitation)
            logger.info(f"Auto-deleted expired invitation for {invitation.email} to session {session_id}")
        else:
            valid_invitations.append(invitation)

    db.commit()

    # Get inviter names
    inviter_ids = [inv.invited_by_user_id for inv in valid_invitations]
    inviters = db.query(User).filter(User.id.in_(inviter_ids)).all() if inviter_ids else []
    inviters_by_id = {u.id: u.name for u in inviters}

    # Build response with expiration info
    responses = []
    for inv in valid_invitations:
        days_since_created = (now - inv.created_at).days
        days_remaining = max(0, 30 - days_since_created)

        responses.append(PendingInvitationResponse(
            id=inv.id,
            email=inv.email,
            session_id=inv.session_id,
            invited_by_name=inviters_by_id.get(inv.invited_by_user_id, "Unknown"),
            created_at=inv.created_at,
            days_remaining=days_remaining,
            is_expired=False  # Already filtered out expired ones
        ))

    return responses


@router.delete("/{session_id}/pending-invitations/{invitation_id}")
async def cancel_invitation(
    session_id: str,
    invitation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a pending invitation (owner only)"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Only owner can cancel invitations
    check_session_access(session, current_user.id, db, require_owner=True)

    invitation = db.query(PendingInvitation).filter(
        PendingInvitation.id == invitation_id,
        PendingInvitation.session_id == session_id
    ).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    db.delete(invitation)
    db.commit()

    return {"message": "Invitation cancelled successfully"}
