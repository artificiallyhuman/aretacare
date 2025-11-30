"""
Admin service layer for business logic related to admin operations.

Handles metrics calculations, account analysis, S3 orphan detection, and audit logging.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
import statistics
import logging

from app.models import (
    User, Session as SessionModel, SessionCollaborator,
    Document, AudioRecording, Conversation, JournalEntry, DailyPlan,
    AdminAuditLog
)
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

        GDPR Compliance: Automatically removes old audit logs to minimize
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

            logger.info(f"GDPR cleanup: Deleted {count} audit log entries older than {retention_days} days")

        return count

    # ==========================================
    # Platform Metrics
    # ==========================================

    def get_platform_metrics(self, db: Session) -> dict:
        """Get current platform-wide metrics."""
        return {
            "user_count": db.query(User).count(),
            "session_count": db.query(SessionModel).count(),
            "document_count": db.query(Document).count(),
            "audio_count": db.query(AudioRecording).count(),
            "conversation_count": db.query(Conversation).count(),
            "journal_count": db.query(JournalEntry).count(),
            "daily_plan_count": db.query(DailyPlan).count()
        }

    def get_metrics_trend(self, db: Session, metric: str, days: int = 30) -> List[dict]:
        """
        Get daily counts for a metric over time.

        Args:
            db: Database session
            metric: One of "users", "sessions", "documents", "audio", "conversations", "journals"
            days: Number of days to look back

        Returns:
            List of {date, count} dictionaries
        """
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=days - 1)

        # Map metric to model and date field
        metric_map = {
            "users": (User, "created_at"),
            "sessions": (SessionModel, "created_at"),
            "documents": (Document, "uploaded_at"),
            "audio": (AudioRecording, "created_at"),
            "conversations": (Conversation, "created_at"),
            "journals": (JournalEntry, "created_at")
        }

        if metric not in metric_map:
            return []

        model, date_field = metric_map[metric]

        # Query for counts by date
        result = db.query(
            func.date(getattr(model, date_field)).label('date'),
            func.count().label('count')
        ).filter(
            getattr(model, date_field) >= start_date
        ).group_by(
            func.date(getattr(model, date_field))
        ).all()

        # Convert to dict for easy lookup
        counts_by_date = {r.date: r.count for r in result}

        # Fill in all dates
        trend_data = []
        current_date = start_date
        while current_date <= end_date:
            trend_data.append({
                "date": current_date,
                "count": counts_by_date.get(current_date, 0)
            })
            current_date += timedelta(days=1)

        return trend_data

    # ==========================================
    # Account Analysis
    # ==========================================

    def get_inactive_accounts(self, db: Session, days: int = 30) -> List[dict]:
        """
        Get accounts with no activity in the specified number of days.

        Activity is determined by the most recent session activity.
        """
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Subquery to get the latest activity per user
        latest_activity_subq = db.query(
            SessionModel.user_id,
            func.max(SessionModel.last_activity).label('last_activity')
        ).group_by(SessionModel.user_id).subquery()

        # Get users with no recent activity or no sessions at all
        inactive_users = db.query(
            User,
            latest_activity_subq.c.last_activity,
            func.count(SessionModel.id).label('session_count')
        ).outerjoin(
            latest_activity_subq,
            User.id == latest_activity_subq.c.user_id
        ).outerjoin(
            SessionModel,
            User.id == SessionModel.user_id
        ).filter(
            (latest_activity_subq.c.last_activity < cutoff) |
            (latest_activity_subq.c.last_activity.is_(None))
        ).group_by(
            User.id,
            latest_activity_subq.c.last_activity
        ).all()

        result = []
        for user, last_activity, session_count in inactive_users:
            if last_activity:
                days_inactive = (datetime.utcnow() - last_activity).days
            else:
                days_inactive = (datetime.utcnow() - user.created_at).days

            result.append({
                "user_id": str(user.id),
                "email": user.email,
                "name": user.name,
                "last_activity": last_activity,
                "days_inactive": days_inactive,
                "session_count": session_count,
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
        """Get detailed user information including all sessions."""
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
        session_details = []
        total_docs = 0
        total_audio = 0
        total_convs = 0

        for session in all_sessions:
            doc_count = db.query(Document).filter(Document.session_id == session.id).count()
            audio_count = db.query(AudioRecording).filter(AudioRecording.session_id == session.id).count()
            conv_count = db.query(Conversation).filter(Conversation.session_id == session.id).count()
            journal_count = db.query(JournalEntry).filter(JournalEntry.session_id == session.id).count()
            collab_count = db.query(SessionCollaborator).filter(SessionCollaborator.session_id == session.id).count()

            total_docs += doc_count
            total_audio += audio_count
            total_convs += conv_count

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
            "total_conversations": total_convs
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
