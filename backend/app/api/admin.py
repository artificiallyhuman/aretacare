"""
Admin API endpoints for platform management.

All endpoints require admin authentication via the ADMIN_EMAILS environment variable.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DBSession
from datetime import datetime, timedelta
import secrets
import logging

from app.core.database import get_db
from app.core.config import settings
from app.api.auth import get_current_user
from app.api.permissions import check_is_admin, require_admin
from app.models import (
    User, Session as SessionModel, SessionCollaborator,
    Document, AudioRecording, AdminAuditLog
)
from app.schemas.admin import (
    PlatformMetrics, MetricsTrendResponse, MetricsTrend,
    InactiveAccount, UnusualAccount,
    AdminUserSummary, AdminUserDetail, AdminUserSession,
    PasswordResetByAdmin, SessionTransfer, SessionTransferResponse,
    OrphanedS3Summary, OrphanedS3File, S3DeleteRequest, S3DeleteResponse,
    AuditLogEntry, AuditLogResponse, AuditLogCleanupResponse,
    SystemHealth, ServiceStatus,
    AdminCheckResponse
)
from app.services.admin_service import admin_service
from app.services.s3_service import s3_service
from app.services.email_service import email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency that requires admin access."""
    return require_admin(current_user)


# ==========================================
# Admin Check
# ==========================================

@router.get("/check", response_model=AdminCheckResponse)
async def check_admin_status(
    current_user: User = Depends(get_current_user)
):
    """Check if the current user is an admin."""
    is_admin = check_is_admin(current_user)
    return AdminCheckResponse(is_admin=is_admin)


# ==========================================
# Platform Metrics
# ==========================================

@router.get("/metrics", response_model=PlatformMetrics)
async def get_platform_metrics(
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get current platform-wide metrics."""
    metrics = admin_service.get_platform_metrics(db)
    return PlatformMetrics(**metrics)


@router.get("/metrics/trends", response_model=MetricsTrendResponse)
async def get_metrics_trend(
    metric: str = Query(..., description="Metric to query: users, sessions, documents, audio, conversations, journals"),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get daily counts for a metric over time."""
    valid_metrics = ["users", "sessions", "documents", "audio", "conversations", "journals"]
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric. Must be one of: {', '.join(valid_metrics)}"
        )

    trend_data = admin_service.get_metrics_trend(db, metric, days)
    return MetricsTrendResponse(
        metric=metric,
        days=days,
        data=[MetricsTrend(**d) for d in trend_data]
    )


# ==========================================
# Account Analysis
# ==========================================

@router.get("/accounts/inactive", response_model=list[InactiveAccount])
async def get_inactive_accounts(
    days: int = Query(30, ge=1, le=365, description="Days of inactivity"),
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get accounts with no activity in the specified number of days."""
    accounts = admin_service.get_inactive_accounts(db, days)
    return [InactiveAccount(**a) for a in accounts]


@router.get("/accounts/unusual", response_model=list[UnusualAccount])
async def get_unusual_accounts(
    z_threshold: float = Query(2.0, ge=1.0, le=5.0, description="Z-score threshold"),
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get accounts with unusual activity patterns (statistical outliers)."""
    accounts = admin_service.get_unusual_accounts(db, z_threshold)
    return [UnusualAccount(**a) for a in accounts]


# ==========================================
# User Administration
# ==========================================

@router.get("/users/search", response_model=list[AdminUserSummary])
async def search_users(
    email: str = Query(..., min_length=1, description="Email to search for (partial match)"),
    limit: int = Query(50, ge=1, le=100, description="Maximum results to return"),
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Search users by email (partial match)."""
    users = admin_service.search_users(db, email, limit)
    return [AdminUserSummary(**u) for u in users]


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get detailed user information including all sessions."""
    user_detail = admin_service.get_user_detail(db, user_id)
    if not user_detail:
        raise HTTPException(status_code=404, detail="User not found")

    return AdminUserDetail(
        **{k: v for k, v in user_detail.items() if k != 'sessions'},
        sessions=[AdminUserSession(**s) for s in user_detail['sessions']]
    )


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetByAdmin)
async def admin_reset_password(
    user_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Trigger a password reset for a user.

    Generates a reset token and sends an email to the user.
    Does NOT reveal the token - the user must use the email link.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate reset token (same as regular password reset flow)
    reset_token = secrets.token_urlsafe(32)
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    # Send password reset email
    email_sent = email_service.send_password_reset_email(user.email, reset_token)

    # Log the action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="password_reset",
        target_type="user",
        target_id=str(user.id),
        details={"user_email": user.email, "email_sent": email_sent}
    )

    return PasswordResetByAdmin(
        message=f"Password reset email sent to {user.email}",
        email_sent=email_sent
    )


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Delete a user and all their owned sessions.

    This will:
    - Delete all S3 files (documents, thumbnails, audio) for owned sessions
    - Delete all database records (sessions, documents, conversations, etc.)
    - Remove the user from any collaborations
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Don't allow deleting self
    if str(user.id) == str(admin_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    user_email = user.email
    user_name = user.name

    # Get all sessions owned by user
    user_sessions = db.query(SessionModel).filter(SessionModel.user_id == user.id).all()

    # Delete all S3 files for all sessions
    for session in user_sessions:
        # Delete documents from S3
        documents = db.query(Document).filter(Document.session_id == session.id).all()
        for doc in documents:
            try:
                await s3_service.delete_file(doc.s3_key)
            except Exception as e:
                logger.error(f"Failed to delete S3 file {doc.s3_key}: {e}")

            if doc.thumbnail_s3_key:
                try:
                    await s3_service.delete_file(doc.thumbnail_s3_key)
                except Exception as e:
                    logger.error(f"Failed to delete S3 thumbnail {doc.thumbnail_s3_key}: {e}")

        # Delete audio from S3
        audio_recordings = db.query(AudioRecording).filter(AudioRecording.session_id == session.id).all()
        for audio in audio_recordings:
            try:
                await s3_service.delete_file(audio.s3_key)
            except Exception as e:
                logger.error(f"Failed to delete S3 audio {audio.s3_key}: {e}")

    # Log the action before deletion
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="user_delete",
        target_type="user",
        target_id=str(user.id),
        details={
            "user_email": user_email,
            "user_name": user_name,
            "session_count": len(user_sessions)
        }
    )

    # Delete user (cascades to sessions, documents, etc.)
    db.delete(user)
    db.commit()

    return {"message": f"User {user_email} deleted successfully"}


# ==========================================
# Session Administration
# ==========================================

@router.post("/sessions/{session_id}/transfer", response_model=SessionTransferResponse)
async def transfer_session_ownership(
    session_id: str,
    transfer_data: SessionTransfer,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Transfer session ownership to another user.

    The new owner must be an existing user.
    The old owner will be removed as owner but NOT added as collaborator.
    """
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Find new owner by email
    new_owner = db.query(User).filter(User.email == transfer_data.new_owner_email).first()
    if not new_owner:
        raise HTTPException(status_code=404, detail="New owner not found")

    old_owner_id = session.owner_id

    # Update ownership
    session.owner_id = new_owner.id
    session.user_id = new_owner.id  # Also update user_id for consistency

    # If new owner was a collaborator, remove that record
    existing_collab = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == new_owner.id
    ).first()
    if existing_collab:
        db.delete(existing_collab)

    db.commit()

    # Log the action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="session_transfer",
        target_type="session",
        target_id=session_id,
        details={
            "old_owner_id": str(old_owner_id),
            "new_owner_id": str(new_owner.id),
            "new_owner_email": new_owner.email,
            "session_name": session.name
        }
    )

    return SessionTransferResponse(
        message=f"Session transferred to {new_owner.email}",
        session_id=session_id,
        new_owner_id=str(new_owner.id),
        new_owner_email=new_owner.email
    )


@router.delete("/sessions/{session_id}")
async def admin_delete_session(
    session_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Delete a session and all associated data.

    This will:
    - Delete all S3 files (documents, thumbnails, audio)
    - Delete all database records
    """
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session_name = session.name
    owner_id = session.owner_id

    # Delete S3 files
    documents = db.query(Document).filter(Document.session_id == session_id).all()
    for doc in documents:
        try:
            await s3_service.delete_file(doc.s3_key)
        except Exception as e:
            logger.error(f"Failed to delete S3 file {doc.s3_key}: {e}")

        if doc.thumbnail_s3_key:
            try:
                await s3_service.delete_file(doc.thumbnail_s3_key)
            except Exception as e:
                logger.error(f"Failed to delete S3 thumbnail {doc.thumbnail_s3_key}: {e}")

    audio_recordings = db.query(AudioRecording).filter(AudioRecording.session_id == session_id).all()
    for audio in audio_recordings:
        try:
            await s3_service.delete_file(audio.s3_key)
        except Exception as e:
            logger.error(f"Failed to delete S3 audio {audio.s3_key}: {e}")

    # Log the action before deletion
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="session_delete",
        target_type="session",
        target_id=session_id,
        details={
            "session_name": session_name,
            "owner_id": str(owner_id),
            "document_count": len(documents),
            "audio_count": len(audio_recordings)
        }
    )

    # Delete session (cascades to all related data)
    db.delete(session)
    db.commit()

    return {"message": f"Session '{session_name}' deleted successfully"}


# ==========================================
# S3 Orphan Management
# ==========================================

@router.get("/s3/orphans", response_model=OrphanedS3Summary)
async def get_orphaned_s3_files(
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Find S3 files not referenced in the database.

    Scans documents/, thumbnails/, and audio/ prefixes.
    """
    orphans = admin_service.get_orphaned_s3_files(db)
    return OrphanedS3Summary(
        total_count=orphans["total_count"],
        total_size=orphans["total_size"],
        by_type=orphans["by_type"],
        files=[OrphanedS3File(**f) for f in orphans["files"]]
    )


@router.delete("/s3/orphans", response_model=S3DeleteResponse)
async def delete_orphaned_s3_files(
    delete_request: S3DeleteRequest,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Delete specified orphaned S3 files.

    Only deletes files that are explicitly listed in the request.
    """
    if not delete_request.keys:
        raise HTTPException(status_code=400, detail="No keys provided")

    # Pass db session for security verification that keys are truly orphaned
    deleted, failed, failed_keys = await admin_service.delete_s3_files(delete_request.keys, db)

    # Log the action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="s3_orphan_delete",
        target_type="s3_files",
        target_id=None,
        details={
            "requested_count": len(delete_request.keys),
            "deleted_count": deleted,
            "failed_count": failed,
            "failed_keys": failed_keys
        }
    )

    return S3DeleteResponse(
        deleted_count=deleted,
        failed_count=failed,
        failed_keys=failed_keys
    )


# ==========================================
# Audit Log
# ==========================================

@router.get("/audit-log", response_model=AuditLogResponse)
async def get_audit_log(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    action: str = Query(None, description="Filter by action type"),
    admin_email: str = Query(None, description="Filter by admin email"),
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get paginated audit log entries."""
    query = db.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())

    if action:
        query = query.filter(AdminAuditLog.action == action)
    if admin_email:
        query = query.filter(AdminAuditLog.admin_email.ilike(f"%{admin_email}%"))

    total = query.count()
    entries = query.offset((page - 1) * limit).limit(limit).all()

    return AuditLogResponse(
        total=total,
        page=page,
        limit=limit,
        entries=[AuditLogEntry.model_validate(e) for e in entries]
    )


@router.post("/audit-log/cleanup", response_model=AuditLogCleanupResponse)
async def cleanup_audit_log(
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Manually trigger audit log cleanup for GDPR compliance.

    Deletes entries older than AUDIT_LOG_RETENTION_DAYS (default: 90 days).
    This runs automatically on server startup, but can be triggered manually.
    """
    deleted_count = admin_service.cleanup_old_audit_logs(db)
    retention_days = settings.AUDIT_LOG_RETENTION_DAYS

    # Log the cleanup action itself
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="audit_log_cleanup",
        target_type="audit_log",
        target_id=None,
        details={"deleted_count": deleted_count, "retention_days": retention_days}
    )

    return AuditLogCleanupResponse(
        deleted_count=deleted_count,
        retention_days=retention_days,
        message=f"Deleted {deleted_count} audit log entries older than {retention_days} days"
    )


# ==========================================
# System Health
# ==========================================

@router.get("/health", response_model=SystemHealth)
async def get_system_health(
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Check the health of all system components."""
    health = await admin_service.check_system_health(db)
    return SystemHealth(
        status=health["status"],
        services=[ServiceStatus(**s) for s in health["services"]],
        checked_at=health["checked_at"]
    )
