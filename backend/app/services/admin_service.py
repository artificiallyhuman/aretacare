"""
Admin service layer for business logic related to admin operations.

Handles metrics calculations, account analysis, S3 orphan detection, and audit logging.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime, timedelta, date
from typing import List, Optional, Tuple
import statistics
import logging

from app.models import (
    User, Session as SessionModel, SessionCollaborator,
    Document, AudioRecording, Conversation, JournalEntry, DailyPlan,
    AdminAuditLog, PendingInvitation
)
from app.models.error_log import ErrorLog
from app.models.security_log import SecurityLog
from app.services.s3_service import s3_service
from app.core.config import settings

logger = logging.getLogger(__name__)


class AdminService:
    """Service for admin operations."""

    # ==========================================
    # Audit Logging
    # ==========================================

    def log_action(
        self,
        db: Session,
        admin_user: User,
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        details: Optional[dict] = None
    ) -> AdminAuditLog:
        """
        Log an admin action to the audit log.

        Args:
            db: Database session
            admin_user: The admin performing the action
            action: Type of action (e.g., "password_reset", "user_delete")
            target_type: Type of target entity (e.g., "user", "session")
            target_id: ID of the target entity
            details: Additional details as JSON

        Returns:
            The created audit log entry
        """
        log_entry = AdminAuditLog(
            admin_user_id=admin_user.id,
            admin_email=admin_user.email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)

        logger.info(f"Admin action logged: {action} by {admin_user.email} on {target_type}/{target_id}")
        return log_entry

    def cleanup_old_audit_logs(self, db: Session) -> int:
        """
        Delete audit log entries older than the retention period.

        Data Retention: Automatically removes old audit logs to minimize
        PII retention while maintaining sufficient records for security.

        Returns:
            Number of entries deleted
        """
        retention_days = settings.AUDIT_LOG_RETENTION_DAYS
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        # Count entries to be deleted
        count = db.query(AdminAuditLog).filter(
            AdminAuditLog.created_at < cutoff_date
        ).count()

        if count > 0:
            # Delete old entries
            db.query(AdminAuditLog).filter(
                AdminAuditLog.created_at < cutoff_date
            ).delete(synchronize_session=False)
            db.commit()

            logger.info(f"Audit log cleanup: Deleted {count} audit log entries older than {retention_days} days")

        return count

    # ==========================================
    # Platform Metrics
    # ==========================================

    def get_platform_metrics(self, db: Session) -> dict:
        """Get current platform-wide metrics."""
        user_count = db.query(User).count()

        # Calculate weekly active users percentage
        # A user is "active" if they've sent a message in the past 7 days
        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        # Get distinct user IDs who have sent messages in the past 7 days
        # We join through sessions to get the user_id
        active_user_ids = db.query(SessionModel.user_id).join(
            Conversation, Conversation.session_id == SessionModel.id
        ).filter(
            Conversation.created_at >= seven_days_ago,
            Conversation.role == 'user'  # Only count user messages, not AI responses
        ).distinct().count()

        weekly_active_percentage = round((active_user_ids / user_count * 100), 1) if user_count > 0 else 0.0

        session_count = db.query(SessionModel).count()
        avg_sessions_per_user = round(session_count / user_count, 1) if user_count > 0 else 0.0

        collaborator_count = db.query(SessionCollaborator).count()
        avg_collaborators_per_user = round(collaborator_count / user_count, 1) if user_count > 0 else 0.0

        pending_invitation_count = db.query(PendingInvitation).count()
        avg_pending_invitations_per_user = round(pending_invitation_count / user_count, 1) if user_count > 0 else 0.0

        document_count = db.query(Document).count()
        avg_documents_per_user = round(document_count / user_count, 1) if user_count > 0 else 0.0

        audio_count = db.query(AudioRecording).count()
        avg_audio_per_user = round(audio_count / user_count, 1) if user_count > 0 else 0.0

        conversation_count = db.query(Conversation).count()
        avg_messages_per_user = round(conversation_count / user_count, 1) if user_count > 0 else 0.0

        journal_count = db.query(JournalEntry).count()
        avg_journal_entries_per_user = round(journal_count / user_count, 1) if user_count > 0 else 0.0

        return {
            "user_count": user_count,
            "weekly_active_percentage": weekly_active_percentage,
            "session_count": session_count,
            "avg_sessions_per_user": avg_sessions_per_user,
            "collaborator_count": collaborator_count,
            "avg_collaborators_per_user": avg_collaborators_per_user,
            "pending_invitation_count": pending_invitation_count,
            "avg_pending_invitations_per_user": avg_pending_invitations_per_user,
            "document_count": document_count,
            "avg_documents_per_user": avg_documents_per_user,
            "audio_count": audio_count,
            "avg_audio_per_user": avg_audio_per_user,
            "conversation_count": conversation_count,
            "avg_messages_per_user": avg_messages_per_user,
            "journal_count": journal_count,
            "avg_journal_entries_per_user": avg_journal_entries_per_user,
            "daily_plan_count": db.query(DailyPlan).count()
        }

    def get_metrics_trend(self, db: Session, metric: str, days: int = 30, user_date: date = None, timezone_offset_hours: int = 0) -> List[dict]:
        """
        Get daily counts for a metric over time.

        Args:
            db: Database session
            metric: One of "users", "sessions", "collaborators", "documents", "audio", "conversations", "journals"
            days: Number of days to look back
            user_date: User's local date (optional, defaults to UTC today)

        Returns:
            List of {date, count} dictionaries
        """
        # Use user's local date if provided, otherwise fall back to UTC date
        end_date = user_date if user_date else datetime.utcnow().date()
        start_date = end_date - timedelta(days=days - 1)

        # Map metric to model and date field
        metric_map = {
            "users": (User, "created_at"),
            "sessions": (SessionModel, "created_at"),
            "collaborators": (SessionCollaborator, "added_at"),
            "documents": (Document, "uploaded_at"),
            "audio": (AudioRecording, "created_at"),
            "conversations": (Conversation, "created_at"),
            "journals": (JournalEntry, "created_at"),
            "error_logs": (ErrorLog, "timestamp"),
            "security_logs": (SecurityLog, "created_at")
        }

        if metric not in metric_map:
            return []

        model, date_field = metric_map[metric]

        # Convert UTC timestamps to user's timezone before grouping by date
        # This ensures data is grouped by the user's local date, not UTC date
        timestamp_column = getattr(model, date_field)

        # Add timezone offset to convert UTC to user's local time
        # Use PostgreSQL's interval type with parameterized query to prevent SQL injection
        # We multiply the offset hours by INTERVAL '1 hour' to get the correct interval
        from sqlalchemy import literal_column
        local_timestamp = timestamp_column + (literal_column("INTERVAL '1 hour'") * timezone_offset_hours)

        # Query for counts by date (in user's timezone)
        result = db.query(
            func.date(local_timestamp).label('date'),
            func.count().label('count')
        ).filter(
            timestamp_column >= start_date,
            timestamp_column < end_date + timedelta(days=2)  # Extended range to capture all timezones
        ).group_by(
            func.date(local_timestamp)
        ).all()

        # Convert to dict for easy lookup (include all dates from query)
        counts_by_date = {r.date: r.count for r in result}

        # Fill in all dates from start to end (in user's local date range)
        trend_data = []
        current_date = start_date
        while current_date <= end_date:
            # Get count for this date
            count = counts_by_date.get(current_date, 0)

            # For today (end_date), also include tomorrow's UTC data
            # This captures records created "today" in user's timezone but stored with "tomorrow" UTC timestamp
            if current_date == end_date:
                tomorrow_utc = end_date + timedelta(days=1)
                count += counts_by_date.get(tomorrow_utc, 0)

            trend_data.append({
                "date": current_date,
                "count": count
            })
            current_date += timedelta(days=1)

        return trend_data

    # ==========================================
    # Account Analysis
    # ==========================================

    def get_inactive_accounts(self, db: Session, days: int = 30) -> List[dict]:
        """
        Get accounts with no activity in the specified number of days.

        Activity is determined by the most recent of:
        - Conversation created
        - Document uploaded
        - Audio recording created
        - Session last_activity timestamp

        Optimized to use batch queries instead of per-user queries (fixes N+1).
        """
        cutoff = datetime.utcnow() - timedelta(days=days)
        now = datetime.utcnow()

        # Batch load all users
        users = db.query(User).all()
        user_ids = [u.id for u in users]
        user_map = {u.id: u for u in users}

        # Batch load all session ownership (owned sessions per user)
        owned_sessions_query = db.query(
            SessionModel.owner_id,
            func.array_agg(SessionModel.id).label('session_ids'),
            func.count(SessionModel.id).label('session_count')
        ).group_by(SessionModel.owner_id).all()
        owned_sessions_map = {row.owner_id: (list(row.session_ids), row.session_count) for row in owned_sessions_query}

        # Batch load all collaboration sessions per user
        collab_sessions_query = db.query(
            SessionCollaborator.user_id,
            func.array_agg(SessionCollaborator.session_id).label('session_ids')
        ).group_by(SessionCollaborator.user_id).all()
        collab_sessions_map = {row.user_id: list(row.session_ids) for row in collab_sessions_query}

        # Build map of all session IDs per user
        user_sessions_map = {}
        for user_id in user_ids:
            owned = owned_sessions_map.get(user_id, ([], 0))[0]
            collab = collab_sessions_map.get(user_id, [])
            user_sessions_map[user_id] = list(set(owned + collab))

        # Batch load latest activity by session
        # Latest conversation per session
        conv_activity = db.query(
            Conversation.session_id,
            func.max(Conversation.created_at).label('latest')
        ).group_by(Conversation.session_id).all()
        conv_map = {row.session_id: row.latest for row in conv_activity}

        # Latest document per session
        doc_activity = db.query(
            Document.session_id,
            func.max(Document.uploaded_at).label('latest')
        ).group_by(Document.session_id).all()
        doc_map = {row.session_id: row.latest for row in doc_activity}

        # Latest audio per session
        audio_activity = db.query(
            AudioRecording.session_id,
            func.max(AudioRecording.created_at).label('latest')
        ).group_by(AudioRecording.session_id).all()
        audio_map = {row.session_id: row.latest for row in audio_activity}

        # Session last_activity
        session_activity = db.query(
            SessionModel.id,
            SessionModel.last_activity
        ).filter(SessionModel.last_activity.isnot(None)).all()
        session_activity_map = {row.id: row.last_activity for row in session_activity}

        result = []
        for user_id, user in user_map.items():
            session_ids = user_sessions_map.get(user_id, [])

            if not session_ids:
                # User has no sessions - inactive since account creation
                days_inactive = (now - user.created_at).days
                if days_inactive >= days:
                    result.append({
                        "user_id": str(user.id),
                        "email": user.email,
                        "name": user.name,
                        "last_activity": None,
                        "days_inactive": days_inactive,
                        "session_count": 0,
                        "created_at": user.created_at
                    })
                continue

            # Find the most recent activity across all sessions for this user
            activity_dates = []
            for sid in session_ids:
                if sid in conv_map:
                    activity_dates.append(conv_map[sid])
                if sid in doc_map:
                    activity_dates.append(doc_map[sid])
                if sid in audio_map:
                    activity_dates.append(audio_map[sid])
                if sid in session_activity_map:
                    activity_dates.append(session_activity_map[sid])

            last_activity = max(activity_dates) if activity_dates else None

            if last_activity:
                days_inactive = (now - last_activity).days
            else:
                days_inactive = (now - user.created_at).days

            # Only include if actually inactive
            if days_inactive >= days:
                result.append({
                    "user_id": str(user.id),
                    "email": user.email,
                    "name": user.name,
                    "last_activity": last_activity,
                    "days_inactive": days_inactive,
                    "session_count": len(session_ids),
                    "created_at": user.created_at
                })

        # Sort by days inactive descending
        result.sort(key=lambda x: x["days_inactive"], reverse=True)
        return result

    def get_unusual_accounts(self, db: Session, z_threshold: float = 2.0) -> List[dict]:
        """
        Get accounts with activity patterns several standard deviations from the mean.

        Checks: conversation count, document count, audio count per user.

        Args:
            db: Database session
            z_threshold: Number of standard deviations to consider "unusual"

        Returns:
            List of unusual accounts with their metrics
        """
        unusual_accounts = []

        # Get per-user metrics
        user_metrics = db.query(
            User.id,
            User.email,
            User.name,
            func.count(func.distinct(Conversation.id)).label('conversation_count'),
            func.count(func.distinct(Document.id)).label('document_count'),
            func.count(func.distinct(AudioRecording.id)).label('audio_count'),
            func.count(func.distinct(SessionModel.id)).label('session_count')
        ).outerjoin(
            SessionModel, User.id == SessionModel.user_id
        ).outerjoin(
            Conversation, SessionModel.id == Conversation.session_id
        ).outerjoin(
            Document, SessionModel.id == Document.session_id
        ).outerjoin(
            AudioRecording, SessionModel.id == AudioRecording.session_id
        ).group_by(User.id).all()

        if len(user_metrics) < 3:  # Need at least 3 data points for meaningful std dev
            return []

        # Calculate stats for each metric
        metrics_to_check = ['conversation_count', 'document_count', 'audio_count']

        for metric_name in metrics_to_check:
            values = [getattr(um, metric_name) for um in user_metrics]
            if not values or max(values) == 0:
                continue

            try:
                avg = statistics.mean(values)
                std = statistics.stdev(values) if len(values) > 1 else 0

                if std == 0:
                    continue

                for um in user_metrics:
                    value = getattr(um, metric_name)
                    z_score = (value - avg) / std if std > 0 else 0

                    if abs(z_score) >= z_threshold:
                        unusual_accounts.append({
                            "user_id": str(um.id),
                            "email": um.email,
                            "name": um.name,
                            "metric_type": metric_name,
                            "value": float(value),
                            "average": round(avg, 2),
                            "std_dev": round(std, 2),
                            "z_score": round(z_score, 2),
                            "session_count": um.session_count
                        })
            except Exception as e:
                logger.warning(f"Error calculating stats for {metric_name}: {e}")
                continue

        # Sort by absolute z-score descending
        unusual_accounts.sort(key=lambda x: abs(x["z_score"]), reverse=True)
        return unusual_accounts

    # ==========================================
    # User Administration
    # ==========================================

    def search_users(self, db: Session, email_query: str, limit: int = 50) -> List[dict]:
        """Search users by email (partial match)."""
        users = db.query(User).filter(
            User.email.ilike(f"%{email_query}%")
        ).limit(limit).all()

        result = []
        for user in users:
            # Get session count and totals
            sessions = db.query(SessionModel).filter(
                SessionModel.user_id == user.id
            ).all()

            session_ids = [s.id for s in sessions]

            doc_count = db.query(Document).filter(
                Document.session_id.in_(session_ids)
            ).count() if session_ids else 0

            conv_count = db.query(Conversation).filter(
                Conversation.session_id.in_(session_ids)
            ).count() if session_ids else 0

            result.append({
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "is_active": user.is_active,
                "created_at": user.created_at,
                "session_count": len(sessions),
                "total_documents": doc_count,
                "total_conversations": conv_count
            })

        return result

    def get_user_detail(self, db: Session, user_id: str) -> Optional[dict]:
        """Get detailed user information including all sessions and recent activity."""
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        # Get all sessions (owned and collaborated)
        owned_sessions = db.query(SessionModel).filter(
            SessionModel.owner_id == user_id
        ).all()

        collaborated_session_ids = db.query(SessionCollaborator.session_id).filter(
            SessionCollaborator.user_id == user_id
        ).all()
        collaborated_session_ids = [s[0] for s in collaborated_session_ids]

        collaborated_sessions = db.query(SessionModel).filter(
            SessionModel.id.in_(collaborated_session_ids)
        ).all() if collaborated_session_ids else []

        all_sessions = owned_sessions + collaborated_sessions
        session_ids = [s.id for s in all_sessions]
        session_details = []
        total_docs = 0
        total_audio = 0
        total_convs = 0
        total_journals = 0

        for session in all_sessions:
            doc_count = db.query(Document).filter(Document.session_id == session.id).count()
            audio_count = db.query(AudioRecording).filter(AudioRecording.session_id == session.id).count()
            conv_count = db.query(Conversation).filter(Conversation.session_id == session.id).count()
            journal_count = db.query(JournalEntry).filter(JournalEntry.session_id == session.id).count()
            collab_count = db.query(SessionCollaborator).filter(SessionCollaborator.session_id == session.id).count()

            total_docs += doc_count
            total_audio += audio_count
            total_convs += conv_count
            total_journals += journal_count

            session_details.append({
                "id": str(session.id),
                "name": session.name,
                "is_owner": str(session.owner_id) == user_id,
                "created_at": session.created_at,
                "last_activity": session.last_activity,
                "document_count": doc_count,
                "audio_count": audio_count,
                "conversation_count": conv_count,
                "journal_count": journal_count,
                "collaborator_count": collab_count
            })

        return {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "last_active_session_id": user.last_active_session_id,
            "sessions": session_details,
            "total_documents": total_docs,
            "total_audio": total_audio,
            "total_conversations": total_convs,
            "total_journals": total_journals
        }

    # ==========================================
    # S3 Orphan Detection
    # ==========================================

    def list_s3_files(self, prefix: str) -> List[dict]:
        """List all files in S3 with the given prefix."""
        files = []
        try:
            paginator = s3_service.s3_client.get_paginator('list_objects_v2')
            for page in paginator.paginate(Bucket=s3_service.bucket_name, Prefix=prefix):
                for obj in page.get('Contents', []):
                    files.append({
                        'key': obj['Key'],
                        'size': obj['Size'],
                        'last_modified': obj['LastModified']
                    })
        except Exception as e:
            logger.error(f"Error listing S3 files with prefix {prefix}: {e}")

        return files

    def get_orphaned_s3_files(self, db: Session) -> dict:
        """
        Find S3 files not referenced in the database.

        Scans documents/, thumbnails/, and audio/ prefixes.
        Uses S3_KEY_PREFIX to only scan current environment's files in shared buckets.
        """
        # Get all valid keys from database
        doc_keys = set(d.s3_key for d in db.query(Document.s3_key).all() if d.s3_key)
        thumb_keys = set(d.thumbnail_s3_key for d in db.query(Document.thumbnail_s3_key).filter(
            Document.thumbnail_s3_key.isnot(None)
        ).all())
        audio_keys = set(a.s3_key for a in db.query(AudioRecording.s3_key).all() if a.s3_key)

        all_valid_keys = doc_keys | thumb_keys | audio_keys

        orphaned_files = []
        total_size = 0
        by_type = {"document": 0, "thumbnail": 0, "audio": 0}

        # Use prefixed paths to only scan current environment's files
        # This allows dev and prod to share the same S3 bucket safely
        documents_prefix = s3_service.get_prefixed_path("documents/")
        thumbnails_prefix = s3_service.get_prefixed_path("thumbnails/")
        audio_prefix = s3_service.get_prefixed_path("audio/")

        # Check documents
        for file in self.list_s3_files(documents_prefix):
            if file['key'] not in all_valid_keys:
                orphaned_files.append({
                    "key": file['key'],
                    "file_type": "document",
                    "size": file['size'],
                    "last_modified": file['last_modified']
                })
                total_size += file['size']
                by_type["document"] += 1

        # Check thumbnails
        for file in self.list_s3_files(thumbnails_prefix):
            if file['key'] not in all_valid_keys:
                orphaned_files.append({
                    "key": file['key'],
                    "file_type": "thumbnail",
                    "size": file['size'],
                    "last_modified": file['last_modified']
                })
                total_size += file['size']
                by_type["thumbnail"] += 1

        # Check audio
        for file in self.list_s3_files(audio_prefix):
            if file['key'] not in all_valid_keys:
                orphaned_files.append({
                    "key": file['key'],
                    "file_type": "audio",
                    "size": file['size'],
                    "last_modified": file['last_modified']
                })
                total_size += file['size']
                by_type["audio"] += 1

        return {
            "total_count": len(orphaned_files),
            "total_size": total_size,
            "by_type": by_type,
            "files": orphaned_files
        }

    async def delete_s3_files(self, keys: List[str], db: Session) -> Tuple[int, int, List[str]]:
        """
        Delete specified S3 files after verifying they are truly orphaned.

        SECURITY: Only deletes files that are NOT referenced in the database.
        This prevents accidental or malicious deletion of legitimate user files.

        Returns: (deleted_count, failed_count, failed_keys)
        """
        # Build set of all valid (non-orphaned) keys from database
        doc_keys = set(d.s3_key for d in db.query(Document.s3_key).all() if d.s3_key)
        thumb_keys = set(d.thumbnail_s3_key for d in db.query(Document.thumbnail_s3_key).filter(
            Document.thumbnail_s3_key.isnot(None)
        ).all())
        audio_keys = set(a.s3_key for a in db.query(AudioRecording.s3_key).all() if a.s3_key)
        all_valid_keys = doc_keys | thumb_keys | audio_keys

        deleted = 0
        failed = 0
        failed_keys = []

        for key in keys:
            # SECURITY CHECK: Verify key is not in database
            if key in all_valid_keys:
                logger.warning(f"Blocked deletion of non-orphaned S3 file: {key}")
                failed += 1
                failed_keys.append(key)
                continue

            try:
                success = await s3_service.delete_file(key)
                if success:
                    deleted += 1
                else:
                    failed += 1
                    failed_keys.append(key)
            except Exception as e:
                logger.error(f"Failed to delete S3 file {key}: {e}")
                failed += 1
                failed_keys.append(key)

        return deleted, failed, failed_keys

    # ==========================================
    # System Health
    # ==========================================

    async def check_system_health(self, db: Session) -> dict:
        """Check the health of all system components."""
        import time
        import httpx

        services = []
        overall_status = "healthy"

        # Check database
        db_start = time.time()
        try:
            db.execute(text("SELECT 1"))
            db_latency = (time.time() - db_start) * 1000
            services.append({
                "name": "database",
                "status": "healthy",
                "latency_ms": round(db_latency, 2),
                "message": None
            })
        except Exception as e:
            services.append({
                "name": "database",
                "status": "unhealthy",
                "latency_ms": None,
                "message": str(e)
            })
            overall_status = "unhealthy"

        # Check S3
        s3_start = time.time()
        try:
            s3_service.s3_client.head_bucket(Bucket=s3_service.bucket_name)
            s3_latency = (time.time() - s3_start) * 1000
            services.append({
                "name": "s3",
                "status": "healthy",
                "latency_ms": round(s3_latency, 2),
                "message": None
            })
        except Exception as e:
            services.append({
                "name": "s3",
                "status": "unhealthy",
                "latency_ms": None,
                "message": str(e)
            })
            overall_status = "unhealthy"

        # Check OpenAI (lightweight ping)
        openai_start = time.time()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get("https://api.openai.com/v1/models", headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}"
                })
                openai_latency = (time.time() - openai_start) * 1000
                if response.status_code == 200:
                    services.append({
                        "name": "openai",
                        "status": "healthy",
                        "latency_ms": round(openai_latency, 2),
                        "message": None
                    })
                else:
                    services.append({
                        "name": "openai",
                        "status": "degraded",
                        "latency_ms": round(openai_latency, 2),
                        "message": f"HTTP {response.status_code}"
                    })
                    if overall_status == "healthy":
                        overall_status = "degraded"
        except Exception as e:
            services.append({
                "name": "openai",
                "status": "unhealthy",
                "latency_ms": None,
                "message": str(e)
            })
            if overall_status == "healthy":
                overall_status = "degraded"

        return {
            "status": overall_status,
            "services": services,
            "checked_at": datetime.utcnow()
        }


# Singleton instance
admin_service = AdminService()
