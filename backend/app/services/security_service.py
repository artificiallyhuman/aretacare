"""
Security logging service for tracking unauthorized access attempts.
"""
import logging
from typing import Optional
from sqlalchemy.orm import Session as DBSession
from fastapi import Request

from app.models.security_log import SecurityLog


logger = logging.getLogger(__name__)


class SecurityService:
    """Service for logging security events."""

    def log_event(
        self,
        db: DBSession,
        event_type: str,
        email: Optional[str] = None,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        endpoint: Optional[str] = None,
        details: Optional[str] = None
    ):
        """Log a security event to the database."""
        try:
            security_log = SecurityLog(
                event_type=event_type,
                email=email,
                user_id=user_id,
                ip_address=ip_address,
                user_agent=user_agent,
                endpoint=endpoint,
                details=details
            )
            db.add(security_log)
            db.commit()
            logger.info(f"Security event logged: {event_type} - {email or user_id or 'unknown'}")
        except Exception as e:
            logger.error(f"Failed to log security event: {e}")
            db.rollback()

    def log_failed_login(
        self,
        db: DBSession,
        email: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Log a failed login attempt."""
        self.log_event(
            db=db,
            event_type="failed_login",
            email=email,
            ip_address=ip_address,
            user_agent=user_agent,
            endpoint="/api/auth/login",
            details="Incorrect email or password"
        )

    def log_invalid_token(
        self,
        db: DBSession,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        endpoint: Optional[str] = None,
        details: Optional[str] = None
    ):
        """Log an invalid or expired JWT token attempt."""
        self.log_event(
            db=db,
            event_type="invalid_token",
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            endpoint=endpoint,
            details=details or "Invalid or expired JWT token"
        )

    def log_unauthorized_access(
        self,
        db: DBSession,
        user_id: str,
        resource_type: str,
        resource_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        endpoint: Optional[str] = None
    ):
        """Log an attempt to access a resource without proper authorization."""
        self.log_event(
            db=db,
            event_type="unauthorized_access",
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            endpoint=endpoint,
            details=f"Attempted to access {resource_type} {resource_id} without permission"
        )

    def get_client_ip(self, request: Request) -> Optional[str]:
        """Extract client IP address from request.

        Checks headers in order of reliability:
        1. CF-Connecting-IP (Cloudflare - most reliable when using CF)
        2. X-Forwarded-For (standard proxy header, first IP is client)
        3. X-Real-IP (nginx and other proxies)
        4. Direct connection (request.client.host)
        """
        # Cloudflare sets this header with the actual client IP
        cf_ip = request.headers.get("CF-Connecting-IP")
        if cf_ip:
            return cf_ip.strip()

        # Standard proxy header (Render, nginx, etc.)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # X-Forwarded-For can contain multiple IPs, get the first one
            return forwarded_for.split(",")[0].strip()

        # Other common proxy header
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()

        # Fallback to direct client
        if request.client:
            return request.client.host

        return None

    def get_user_agent(self, request: Request) -> Optional[str]:
        """Extract user agent from request."""
        user_agent = request.headers.get("User-Agent")
        if user_agent and len(user_agent) > 500:
            return user_agent[:500]  # Truncate to match database column size
        return user_agent

    # Account lockout configuration
    LOCKOUT_THRESHOLD = 5  # Number of failed attempts before lockout
    LOCKOUT_WINDOW_MINUTES = 15  # Time window to count failed attempts
    LOCKOUT_DURATION_MINUTES = 15  # How long the account is locked

    def check_account_lockout(
        self,
        db: DBSession,
        email: str,
        ip_address: Optional[str] = None
    ) -> dict:
        """
        Check if an account or IP is locked out due to failed login attempts.

        Args:
            db: Database session
            email: Email address to check
            ip_address: IP address to check

        Returns:
            dict with 'is_locked', 'failed_attempts', 'lockout_remaining_seconds' keys
        """
        from datetime import datetime, timedelta
        from sqlalchemy import and_, or_

        cutoff_time = datetime.utcnow() - timedelta(minutes=self.LOCKOUT_WINDOW_MINUTES)

        # Count failed login attempts for this email or IP in the time window
        query = db.query(SecurityLog).filter(
            and_(
                SecurityLog.created_at >= cutoff_time,
                SecurityLog.event_type == "failed_login"
            )
        )

        # Check both email and IP
        filters = [SecurityLog.email == email]
        if ip_address:
            filters.append(SecurityLog.ip_address == ip_address)

        query = query.filter(or_(*filters))
        failed_attempts = query.count()

        is_locked = failed_attempts >= self.LOCKOUT_THRESHOLD

        # Calculate remaining lockout time if locked
        lockout_remaining_seconds = 0
        if is_locked:
            # Get the most recent failed attempt
            most_recent = query.order_by(SecurityLog.created_at.desc()).first()
            if most_recent:
                lockout_end = most_recent.created_at + timedelta(minutes=self.LOCKOUT_DURATION_MINUTES)
                now = datetime.utcnow()
                # Handle timezone-aware vs naive datetime comparison
                if lockout_end.tzinfo is not None:
                    lockout_end = lockout_end.replace(tzinfo=None)
                remaining = lockout_end - now
                lockout_remaining_seconds = max(0, int(remaining.total_seconds()))

                # If lockout has expired, account is not locked
                if lockout_remaining_seconds == 0:
                    is_locked = False

        return {
            "is_locked": is_locked,
            "failed_attempts": failed_attempts,
            "lockout_remaining_seconds": lockout_remaining_seconds,
            "threshold": self.LOCKOUT_THRESHOLD
        }

    def log_account_lockout(
        self,
        db: DBSession,
        email: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Log when an account gets locked out."""
        self.log_event(
            db=db,
            event_type="account_lockout",
            email=email,
            ip_address=ip_address,
            user_agent=user_agent,
            endpoint="/api/auth/login",
            details=f"Account locked after {self.LOCKOUT_THRESHOLD} failed attempts"
        )

    def check_repeated_upload_failures(
        self,
        db: DBSession,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        time_window_minutes: int = 15,
        threshold: int = 5
    ) -> dict:
        """
        Check for repeated upload failures from the same user or IP address.

        Args:
            db: Database session
            user_id: User ID to check
            ip_address: IP address to check
            time_window_minutes: Time window to check (default: 15 minutes)
            threshold: Number of failures to trigger alert (default: 5)

        Returns:
            dict with 'abuse_detected', 'failure_count', and 'time_window' keys
        """
        from datetime import datetime, timedelta
        from sqlalchemy import and_, or_

        cutoff_time = datetime.utcnow() - timedelta(minutes=time_window_minutes)

        # Build query for upload failures and blocked uploads
        query = db.query(SecurityLog).filter(
            and_(
                SecurityLog.created_at >= cutoff_time,
                or_(
                    SecurityLog.event_type == "upload_failure",
                    SecurityLog.event_type == "blocked_file_upload"
                )
            )
        )

        # Filter by user_id OR ip_address
        filters = []
        if user_id:
            filters.append(SecurityLog.user_id == user_id)
        if ip_address:
            filters.append(SecurityLog.ip_address == ip_address)

        if filters:
            query = query.filter(or_(*filters))

        failure_count = query.count()

        return {
            "abuse_detected": failure_count >= threshold,
            "failure_count": failure_count,
            "time_window": time_window_minutes,
            "threshold": threshold
        }


security_service = SecurityService()
