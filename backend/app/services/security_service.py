"""
Security logging service for tracking unauthorized access attempts.
"""
import logging
import threading
from collections import deque
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session as DBSession
from fastapi import Request

from app.models.security_log import SecurityLog
from app.core.client_ip import get_client_ip
from app.core.config import settings


logger = logging.getLogger(__name__)


class SecurityService:
    """Service for logging security events."""

    # Security alert rate limiting
    ALERT_RATE_LIMIT = 10  # Maximum alerts per hour
    ALERT_WINDOW_SECONDS = 3600  # 1 hour window
    _alert_timestamps: deque = deque()  # Timestamps of sent alerts
    _alert_lock = threading.Lock()  # Thread safety for rate limit tracking

    def _can_send_alert(self) -> bool:
        """
        Check if we can send another alert (rate limit check).
        Thread-safe implementation using a sliding window.

        Returns:
            bool: True if under rate limit, False otherwise
        """
        with self._alert_lock:
            now = datetime.utcnow()
            cutoff = now - timedelta(seconds=self.ALERT_WINDOW_SECONDS)

            # Remove timestamps older than the window
            while self._alert_timestamps and self._alert_timestamps[0] < cutoff:
                self._alert_timestamps.popleft()

            # Check if under limit
            if len(self._alert_timestamps) >= self.ALERT_RATE_LIMIT:
                logger.warning(f"Security alert rate limit reached ({self.ALERT_RATE_LIMIT}/hour)")
                return False

            # Record this alert
            self._alert_timestamps.append(now)
            return True

    def _send_alert_async(
        self,
        event_type: str,
        email: Optional[str],
        user_id: Optional[str],
        ip_address: Optional[str],
        user_agent: Optional[str],
        endpoint: Optional[str],
        details: Optional[str]
    ) -> None:
        """
        Send security alert email in a background thread.
        Fire-and-forget - failures are logged but do not raise exceptions.
        """
        def send():
            try:
                from app.services.email_service import EmailService
                EmailService.send_security_alert_email(
                    event_type=event_type,
                    email=email,
                    user_id=user_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    endpoint=endpoint,
                    details=details,
                    timestamp=datetime.utcnow()
                )
            except Exception as e:
                logger.error(f"Failed to send security alert email: {e}")

        thread = threading.Thread(target=send, daemon=True)
        thread.start()

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
        """Log a security event to the database and optionally send alert."""
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
            logger.debug(f"Security event logged: {event_type}")

            # Check if this event type should trigger an alert
            if event_type.lower() in settings.security_alert_events_list:
                if self._can_send_alert():
                    self._send_alert_async(
                        event_type=event_type,
                        email=email,
                        user_id=user_id,
                        ip_address=ip_address,
                        user_agent=user_agent,
                        endpoint=endpoint,
                        details=details
                    )
                else:
                    logger.warning(f"Security alert suppressed (rate limit): {event_type}")

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
        """Extract the client IP address from the request.

        Delegates to the shared proxy-aware resolver in app.core.client_ip,
        which only honors forwarding headers from trusted proxies.
        """
        return get_client_ip(request)

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

    # MFA lockout configuration
    MFA_LOCKOUT_THRESHOLD = 10  # Number of failed MFA attempts before lockout
    MFA_LOCKOUT_WINDOW_MINUTES = 60  # Time window for MFA failures (1 hour)
    MFA_ALERT_THRESHOLD = 5  # Send email alert after this many failures

    # Password reset request throttling (per account, complements per-IP rate limit)
    RESET_REQUEST_LIMIT = 3  # Max reset emails per window per account
    RESET_REQUEST_WINDOW_MINUTES = 60  # Time window for counting reset emails

    def check_mfa_lockout(
        self,
        db: DBSession,
        user_id: str
    ) -> dict:
        """
        Check if MFA verification is locked out due to too many failed attempts.

        Args:
            db: Database session
            user_id: User ID to check

        Returns:
            dict with 'is_locked' and 'failed_attempts' keys
        """
        from sqlalchemy import and_

        cutoff_time = datetime.utcnow() - timedelta(minutes=self.MFA_LOCKOUT_WINDOW_MINUTES)

        failed_attempts = db.query(SecurityLog).filter(
            and_(
                SecurityLog.created_at >= cutoff_time,
                SecurityLog.event_type == "mfa_login_failed",
                SecurityLog.user_id == user_id
            )
        ).count()

        return {
            "is_locked": failed_attempts >= self.MFA_LOCKOUT_THRESHOLD,
            "failed_attempts": failed_attempts
        }

    def check_account_lockout(
        self,
        db: DBSession,
        email: str,
        ip_address: Optional[str] = None
    ) -> dict:
        """
        Check if an account is locked out due to failed login attempts.

        Account lockout is based primarily on email (the account identifier).
        IP address is logged for auditing but not used for lockout decisions,
        as attackers could bypass IP-based lockout with distributed attacks,
        while legitimate users may share IPs (NAT, VPN, corporate networks).

        Args:
            db: Database session
            email: Email address to check
            ip_address: IP address (logged for auditing, not used for lockout)

        Returns:
            dict with 'is_locked', 'failed_attempts', 'lockout_remaining_seconds' keys
        """
        from datetime import datetime, timedelta
        from sqlalchemy import and_

        cutoff_time = datetime.utcnow() - timedelta(minutes=self.LOCKOUT_WINDOW_MINUTES)

        # Count failed login attempts for this email in the time window
        # Using email only prevents attackers from bypassing lockout by changing IPs
        query = db.query(SecurityLog).filter(
            and_(
                SecurityLog.created_at >= cutoff_time,
                SecurityLog.event_type == "failed_login",
                SecurityLog.email == email
            )
        )

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

    def check_password_reset_throttle(self, db: DBSession, email: str) -> bool:
        """
        Check if this account has reached the reset-email limit for the window.

        Counted against emails actually sent (logged events), not raw requests,
        so requests rejected by the throttle don't extend the window and the
        account owner regains reset ability as the window slides.

        Returns:
            bool: True if the limit has been reached (caller should skip sending)
        """
        cutoff_time = datetime.utcnow() - timedelta(minutes=self.RESET_REQUEST_WINDOW_MINUTES)

        sent_count = db.query(SecurityLog).filter(
            SecurityLog.created_at >= cutoff_time,
            SecurityLog.event_type == "password_reset_requested",
            SecurityLog.email == email
        ).count()

        return sent_count >= self.RESET_REQUEST_LIMIT

    def log_password_reset_request(
        self,
        db: DBSession,
        email: str,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Log that a password reset email is being sent."""
        self.log_event(
            db=db,
            event_type="password_reset_requested",
            email=email,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            endpoint="/api/auth/password-reset/request",
            details="Password reset email sent"
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
