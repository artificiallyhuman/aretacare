"""
Admin API endpoints for platform management.

All endpoints require admin authentication via the ADMIN_EMAILS environment variable.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session as DBSession
from datetime import datetime, date, timedelta
from typing import Optional
import secrets
import logging

from app.core.database import get_db
from app.core.config import settings
from app.api.auth import get_current_user
from app.api.permissions import check_is_admin, require_admin
from app.models import (
    User, Session as SessionModel, SessionCollaborator,
    Document, AudioRecording, AdminAuditLog, SecurityLog, ErrorLog, ApiLog,
    RefreshToken, WaitlistEntry
)
from app.schemas.admin import (
    PlatformMetrics, MetricsTrendResponse, MetricsTrend,
    InactiveAccount, UnusualAccount,
    AdminUserSummary, AdminUserDetail, AdminUserSession,
    PasswordResetByAdmin, SessionTransfer, SessionTransferResponse,
    OrphanedS3Summary, OrphanedS3File, S3DeleteRequest, S3DeleteResponse,
    AuditLogEntry, AuditLogResponse, AuditLogCleanupResponse,
    SystemHealth, ServiceStatus,
    AdminCheckResponse,
    SecurityLogEntry, SecurityLogResponse,
    EmailInactiveUsersRequest, EmailInactiveUsersResponse,
    ErrorLogEntry, ErrorLogResponse, ErrorLogCleanupResponse,
    ApiLogEntry, ApiLogSummary, ApiLogResponse,
    RefreshTokenInfo, UserTokensResponse, RevokeTokenResponse
)
from app.schemas.admin_report import (
    AdminReportResponse, AdminReportListResponse, AdminReportGenerateResponse
)
from app.schemas.waitlist import (
    WaitlistEntryResponse, WaitlistAddRequest, WaitlistUpdateRequest
)
from app.services.admin_service import admin_service
from app.services.admin_report_service import admin_report_service
from app.models.admin_report import AdminReport
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
    background_tasks: BackgroundTasks,
    user_date: str = None,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Check if the current user is an admin.

    If admin, also triggers daily report generation if one doesn't exist for the user's date.
    """
    is_admin = check_is_admin(current_user)

    # If admin, ensure today's report exists (generate if needed)
    if is_admin:
        # Parse user's local date or fall back to UTC
        if user_date:
            try:
                report_date = datetime.strptime(user_date, "%Y-%m-%d").date()
            except ValueError:
                report_date = date.today()
        else:
            report_date = date.today()

        existing_report = db.query(AdminReport).filter(
            AdminReport.date == report_date
        ).first()

        if not existing_report:
            # Generate report in background so it doesn't slow down the check
            async def generate_daily_report():
                from app.core.database import SessionLocal
                report_db = SessionLocal()
                try:
                    await admin_report_service.generate_report(report_db, report_date)
                    logger.info(f"Daily admin report generated for {report_date}")
                except Exception as e:
                    logger.error(f"Failed to generate daily admin report: {e}")
                finally:
                    report_db.close()

            background_tasks.add_task(generate_daily_report)

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
    metric: str = Query(..., description="Metric to query: users, sessions, collaborators, documents, audio, conversations, journals"),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    user_date: str = Query(None, description="User's local date in YYYY-MM-DD format (optional)"),
    timezone_offset_hours: int = Query(0, ge=-12, le=14, description="User's timezone offset from UTC in hours (optional)"),
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get daily counts for a metric over time."""
    valid_metrics = ["users", "sessions", "collaborators", "documents", "audio", "conversations", "journals", "error_logs", "security_logs"]
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric. Must be one of: {', '.join(valid_metrics)}"
        )

    # Parse user_date if provided
    parsed_user_date = None
    if user_date:
        try:
            from datetime import datetime
            parsed_user_date = datetime.strptime(user_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid user_date format. Use YYYY-MM-DD."
            )

    trend_data = admin_service.get_metrics_trend(db, metric, days, parsed_user_date, timezone_offset_hours)
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


@router.post("/accounts/inactive/email", response_model=EmailInactiveUsersResponse)
async def email_inactive_accounts(
    request: EmailInactiveUsersRequest,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Send inactivity notification emails to selected users."""
    emails_sent = 0
    emails_failed = 0
    details = []

    for user_id in request.user_ids:
        # Get user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            details.append({
                "user_id": user_id,
                "email": None,
                "status": "failed",
                "reason": "User not found"
            })
            emails_failed += 1
            continue

        # Calculate days inactive
        last_activity = admin_service.get_user_last_activity(db, user_id)
        if last_activity:
            days_inactive = (datetime.utcnow() - last_activity).days
        else:
            days_inactive = (datetime.utcnow() - user.created_at).days

        # Send email
        success = email_service.send_inactive_account_notification(
            user.email,
            user.name,
            days_inactive
        )

        if success:
            emails_sent += 1
            details.append({
                "user_id": user_id,
                "email": user.email,
                "status": "sent",
                "days_inactive": days_inactive
            })

            # Log to audit log
            audit_log = AdminAuditLog(
                admin_user_id=admin_user.id,
                admin_email=admin_user.email,
                action="inactive_account_email",
                target_type="user",
                target_id=user_id,
                details={
                    "recipient_email": user.email,
                    "days_inactive": days_inactive
                }
            )
            db.add(audit_log)
        else:
            emails_failed += 1
            details.append({
                "user_id": user_id,
                "email": user.email,
                "status": "failed",
                "reason": "Email send failed"
            })

    db.commit()

    return EmailInactiveUsersResponse(
        emails_sent=emails_sent,
        emails_failed=emails_failed,
        details=details
    )


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
# Token Management
# ==========================================

@router.get("/users/{user_id}/tokens", response_model=UserTokensResponse)
async def get_user_tokens(
    user_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Get all refresh tokens for a user (both active and revoked).

    Returns tokens with device information and usage statistics.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get all tokens for this user
    all_tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id
    ).order_by(RefreshToken.created_at.desc()).all()

    active_tokens = []
    revoked_tokens = []
    now = datetime.utcnow()

    for token in all_tokens:
        is_expired = now > token.expires_at
        token_info = RefreshTokenInfo(
            id=token.id,
            created_at=token.created_at,
            expires_at=token.expires_at,
            last_used_at=token.last_used_at,
            is_revoked=token.is_revoked,
            revoked_at=token.revoked_at,
            device_info=token.device_info,
            ip_address=token.ip_address,
            is_expired=is_expired
        )

        if token.is_revoked or is_expired:
            revoked_tokens.append(token_info)
        else:
            active_tokens.append(token_info)

    # Log the action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="view_user_tokens",
        target_type="user",
        target_id=str(user.id),
        details={
            "user_email": user.email,
            "active_tokens": len(active_tokens),
            "revoked_tokens": len(revoked_tokens)
        }
    )

    return UserTokensResponse(
        user_id=str(user.id),
        user_email=user.email,
        active_tokens=active_tokens,
        revoked_tokens=revoked_tokens,
        total_active=len(active_tokens),
        total_revoked=len(revoked_tokens)
    )


@router.post("/users/{user_id}/tokens/revoke-all")
async def revoke_all_user_tokens_admin(
    user_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Revoke all active refresh tokens for a user (admin version of logout everywhere).

    This will force the user to re-authenticate on all devices.
    Useful for security incidents or account compromise.
    """
    from app.core.auth import revoke_all_user_tokens

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Revoke all tokens
    count = revoke_all_user_tokens(db, user_id)

    # Log the action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="revoke_all_tokens",
        target_type="user",
        target_id=str(user.id),
        details={
            "user_email": user.email,
            "tokens_revoked": count
        }
    )

    return {
        "message": f"Revoked {count} token(s) for user {user.email}",
        "tokens_revoked": count,
        "user_email": user.email
    }


@router.delete("/tokens/{token_id}", response_model=RevokeTokenResponse)
async def revoke_single_token(
    token_id: int,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """
    Revoke a specific refresh token by ID.

    Use this to log out a user from a specific device.
    """
    from app.core.auth import revoke_refresh_token

    token = db.query(RefreshToken).filter(RefreshToken.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Get user info for logging
    user = db.query(User).filter(User.id == token.user_id).first()

    # Revoke the token
    success = revoke_refresh_token(db, token_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to revoke token")

    # Log the action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="revoke_token",
        target_type="refresh_token",
        target_id=str(token_id),
        details={
            "user_id": str(token.user_id),
            "user_email": user.email if user else None,
            "device_info": token.device_info,
            "ip_address": token.ip_address
        }
    )

    return RevokeTokenResponse(
        message=f"Token {token_id} revoked successfully",
        revoked_token_id=token_id
    )


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
    Manually trigger audit log cleanup for data retention.

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


# ==========================================
# Security Logs
# ==========================================

@router.get("/security-logs", response_model=SecurityLogResponse)
async def get_security_logs(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Results per page"),
    event_type: Optional[str] = Query(None, description="Filter by event type: failed_login, invalid_token, unauthorized_access"),
    email: Optional[str] = Query(None, description="Filter by email"),
    exclude_invalid_tokens: bool = Query(True, description="Exclude invalid_token events (they're common and expected)"),
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get paginated security logs with optional filters."""
    # Build query
    query = db.query(SecurityLog)

    # Apply filters
    if event_type:
        query = query.filter(SecurityLog.event_type == event_type)
    elif exclude_invalid_tokens:
        # Only exclude if not filtering by a specific event type
        query = query.filter(SecurityLog.event_type != "invalid_token")
    if email:
        query = query.filter(SecurityLog.email.ilike(f"%{email}%"))

    # Get total count
    total = query.count()

    # Get paginated results
    offset = (page - 1) * page_size
    logs = query.order_by(SecurityLog.created_at.desc()).offset(offset).limit(page_size).all()

    return SecurityLogResponse(
        logs=[SecurityLogEntry.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size
    )


# ==========================================
# Error Logs
# ==========================================

@router.get("/error-logs", response_model=ErrorLogResponse)
async def get_error_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    level: Optional[str] = Query(None, description="Filter by error level (ERROR, WARNING, CRITICAL)"),
    source: Optional[str] = Query(None, description="Filter by source module"),
    db: DBSession = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """
    Get paginated error logs with optional filtering.

    Requires admin authentication.
    """
    query = db.query(ErrorLog)

    # Apply filters
    if level:
        query = query.filter(ErrorLog.level == level.upper())
    if source:
        query = query.filter(ErrorLog.source.ilike(f"%{source}%"))

    # Get total count
    total = query.count()

    # Get paginated results
    offset = (page - 1) * page_size
    logs = query.order_by(ErrorLog.timestamp.desc()).offset(offset).limit(page_size).all()

    return ErrorLogResponse(
        logs=[ErrorLogEntry.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size
    )


@router.delete("/error-logs/cleanup", response_model=ErrorLogCleanupResponse)
async def cleanup_error_logs(
    days: int = Query(90, ge=1, description="Delete error logs older than this many days"),
    db: DBSession = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """
    Delete error logs older than specified days.

    Requires admin authentication.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    deleted_count = db.query(ErrorLog).filter(
        ErrorLog.timestamp < cutoff_date
    ).delete()

    db.commit()

    # Log the cleanup action
    admin_service.log_admin_action(
        db=db,
        admin_user_id=admin.id,
        admin_email=admin.email,
        action="error_logs_cleanup",
        details={"days": days, "deleted_count": deleted_count}
    )

    logger.info(f"Admin {admin.email} deleted {deleted_count} error logs older than {days} days")

    return ErrorLogCleanupResponse(deleted_count=deleted_count)


# ==========================================
# API Logs (GPT-5.2 Request Monitoring)
# ==========================================

@router.get("/api-logs", response_model=ApiLogResponse)
async def get_api_logs(
    feature: Optional[str] = Query(None, description="Filter by feature (e.g., conversation, daily_plan)"),
    success: Optional[bool] = Query(None, description="Filter by success status"),
    days: int = Query(1, ge=1, le=30, description="Number of days to look back (1-30)"),
    db: DBSession = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    """
    Get GPT-5.2 API request logs from the specified time range.

    Returns summary metrics and individual log entries in reverse chronological order.
    No sensitive user data is disclosed - only user IDs for reference.

    Requires admin authentication.
    """
    from sqlalchemy import func

    # Get logs from specified days
    cutoff_time = datetime.utcnow() - timedelta(days=days)

    # Build base query
    query = db.query(ApiLog).filter(ApiLog.created_at >= cutoff_time)

    if feature:
        query = query.filter(ApiLog.feature == feature)
    if success is not None:
        query = query.filter(ApiLog.success == success)

    # Get logs sorted by created_at descending (most recent first)
    logs = query.order_by(ApiLog.created_at.desc()).all()

    # Calculate summary metrics from the filtered logs
    total_requests = len(logs)
    successful_requests = sum(1 for log in logs if log.success)
    failed_requests = total_requests - successful_requests
    success_rate = (successful_requests / total_requests * 100) if total_requests > 0 else 0.0

    total_input_tokens = sum(log.input_tokens or 0 for log in logs)
    total_output_tokens = sum(log.output_tokens or 0 for log in logs)

    # Calculate average response time (only for logs that have it)
    response_times = [log.response_time_ms for log in logs if log.response_time_ms is not None]
    avg_response_time_ms = sum(response_times) / len(response_times) if response_times else None

    summary = ApiLogSummary(
        total_requests=total_requests,
        successful_requests=successful_requests,
        failed_requests=failed_requests,
        success_rate=round(success_rate, 2),
        total_input_tokens=total_input_tokens,
        total_output_tokens=total_output_tokens,
        avg_response_time_ms=round(avg_response_time_ms, 0) if avg_response_time_ms else None
    )

    return ApiLogResponse(
        summary=summary,
        logs=[ApiLogEntry.model_validate(log) for log in logs]
    )


# ==========================================
# Admin Reports
# ==========================================

@router.get("/reports", response_model=AdminReportListResponse)
async def get_admin_reports(
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get all admin reports (within retention period)."""
    reports = admin_report_service.get_all_reports(db)
    return AdminReportListResponse(
        reports=[AdminReportResponse.model_validate(r) for r in reports],
        total=len(reports)
    )


@router.get("/reports/latest", response_model=Optional[AdminReportResponse])
async def get_latest_admin_report(
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get the most recent admin report."""
    report = admin_report_service.get_latest_report(db)
    if not report:
        return None
    return AdminReportResponse.model_validate(report)


@router.post("/reports/generate", response_model=AdminReportGenerateResponse)
async def generate_admin_report(
    user_date: str = None,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Generate a new admin report for the user's local date.

    If a report already exists for that date, it will be replaced.
    """
    # Parse user's local date or fall back to UTC
    if user_date:
        try:
            report_date = datetime.strptime(user_date, "%Y-%m-%d").date()
        except ValueError:
            report_date = date.today()
    else:
        report_date = date.today()

    # Log the action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="admin_report_generate",
        target_type="admin_report",
        target_id=None,
        details={"triggered_by": "manual", "date": str(report_date)}
    )

    try:
        report = await admin_report_service.generate_report(db, report_date)
        return AdminReportGenerateResponse(
            report=AdminReportResponse.model_validate(report),
            message="Report generated successfully"
        )
    except Exception as e:
        logger.error(f"Failed to generate admin report: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


# ==========================================
# Waitlist Management
# ==========================================

@router.get("/waitlist", response_model=list[WaitlistEntryResponse])
async def get_waitlist(
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Get all waitlist entries."""
    entries = db.query(WaitlistEntry).order_by(WaitlistEntry.created_at.desc()).all()

    return [
        WaitlistEntryResponse(
            id=e.id,
            email=e.email,
            created_at=e.created_at,
            invited_at=e.invited_at,
            has_invitation=e.invitation_token is not None,
            notes=e.notes,
            user_message=e.user_message,
            added_by_email=e.added_by_email,
            referrers=e.referrers
        ) for e in entries
    ]


@router.post("/waitlist", response_model=WaitlistEntryResponse)
async def add_to_waitlist(
    data: WaitlistAddRequest,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Manually add an email to the waitlist."""
    email = data.email.lower().strip()

    # Check if already registered
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered as a user")

    # Check if already on waitlist
    existing = db.query(WaitlistEntry).filter(WaitlistEntry.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already on waitlist")

    entry = WaitlistEntry(
        email=email,
        added_by_email=admin_user.email
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Log admin action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="waitlist_add",
        target_type="waitlist",
        target_id=entry.id,
        details={"email": email}
    )

    return WaitlistEntryResponse(
        id=entry.id,
        email=entry.email,
        created_at=entry.created_at,
        invited_at=entry.invited_at,
        has_invitation=False,
        notes=entry.notes,
        added_by_email=entry.added_by_email,
        referrers=entry.referrers
    )


@router.post("/waitlist/{entry_id}/invite")
async def send_waitlist_invitation(
    entry_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Send invitation to a waitlist entry."""
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    # Check if user already registered
    existing_user = db.query(User).filter(User.email == entry.email).first()
    if existing_user:
        # Remove from waitlist since they already registered
        db.delete(entry)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="This email is already registered as a user."
        )

    # Generate invitation token
    entry.invitation_token = secrets.token_urlsafe(32)
    entry.invitation_expires = datetime.utcnow() + timedelta(days=7)
    entry.invited_at = datetime.utcnow()
    db.commit()

    # Send invitation email
    email_service.send_waitlist_invitation(
        to_email=entry.email,
        invitation_token=entry.invitation_token
    )

    # Log admin action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="waitlist_invite",
        target_type="waitlist",
        target_id=entry_id,
        details={"email": entry.email}
    )

    return {"message": f"Invitation sent to {entry.email}"}


@router.patch("/waitlist/{entry_id}")
async def update_waitlist_entry(
    entry_id: str,
    data: WaitlistUpdateRequest,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Update a waitlist entry (e.g., add notes)."""
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    if data.notes is not None:
        entry.notes = data.notes

    db.commit()

    return {"message": "Entry updated"}


@router.delete("/waitlist/{entry_id}")
async def delete_waitlist_entry(
    entry_id: str,
    admin_user: User = Depends(get_admin_user),
    db: DBSession = Depends(get_db)
):
    """Remove an entry from the waitlist."""
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    email = entry.email
    db.delete(entry)
    db.commit()

    # Log admin action
    admin_service.log_action(
        db=db,
        admin_user=admin_user,
        action="waitlist_delete",
        target_type="waitlist",
        target_id=entry_id,
        details={"email": email}
    )

    return {"message": "Entry removed from waitlist"}
