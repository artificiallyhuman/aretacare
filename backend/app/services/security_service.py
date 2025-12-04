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
        """Extract client IP address from request."""
        # Check for proxied requests (Render, Cloudflare, etc.)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # X-Forwarded-For can contain multiple IPs, get the first one
            return forwarded_for.split(",")[0].strip()

        # Check other common headers
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

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


security_service = SecurityService()
