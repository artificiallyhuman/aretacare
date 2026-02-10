"""
Rate limiting configuration for AretaCare API.

Uses slowapi to implement rate limiting based on client IP address.
Different limits are applied to different endpoint categories.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse
import logging
import time

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """
    Get client IP address, checking proxy headers in order of reliability.
    Supports Cloudflare, standard proxies (Render, nginx), and direct connections.
    """
    # Cloudflare sets this header with the actual client IP
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    # Standard proxy header (Render, nginx, etc.)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For can contain multiple IPs; first is the original client
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Initialize rate limiter with client IP as key
limiter = Limiter(key_func=get_client_ip)


def cleanup_rate_limit_storage():
    """Evict expired entries from the in-memory rate limit storage.

    slowapi's default MemoryStorage keeps expired counters in its internal dict
    indefinitely (they're only checked on access). Over time with many unique IPs,
    this dict grows without bound. This function removes entries whose TTL has
    passed, and should be called periodically (e.g. every hour).
    """
    try:
        storage = limiter._storage
        # limits.storage.MemoryStorage stores data in .storage (dict) and
        # .expirations (dict of key -> expiry_timestamp)
        if hasattr(storage, "expirations") and hasattr(storage, "storage"):
            now = time.time()
            expired_keys = [
                k for k, expiry in list(storage.expirations.items())
                if expiry <= now
            ]
            for k in expired_keys:
                storage.storage.pop(k, None)
                storage.expirations.pop(k, None)
            if expired_keys:
                logger.info(f"Rate limit cleanup: evicted {len(expired_keys)} expired entries")
    except Exception as e:
        logger.warning(f"Rate limit cleanup failed (non-fatal): {e}")


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom handler for rate limit exceeded errors."""
    logger.warning(
        f"Rate limit exceeded: {get_client_ip(request)} on {request.url.path}"
    )

    # Provide more specific messages for auth endpoints
    path = request.url.path
    if "/auth/login" in path:
        message = "Too many login attempts. Please wait a minute before trying again."
    elif "/auth/register" in path:
        message = "Too many registration attempts. Please try again later."
    elif "/auth/login/mfa" in path:
        message = "Too many MFA verification attempts. Please wait before trying again."
    elif "/auth/password-reset" in path:
        message = "Too many password reset attempts. Please try again later."
    elif "/admin/" in path:
        message = "Too many admin requests. Please slow down."
    elif "/waitlist/join" in path:
        message = "Too many waitlist submissions. Please try again later."
    else:
        message = "Too many requests. Please try again later."

    return JSONResponse(
        status_code=429,
        content={
            "detail": message,
            "retry_after": exc.detail
        }
    )


# Rate limit constants - centralized configuration
class RateLimits:
    """Rate limit configurations for different endpoint types."""

    # Authentication endpoints (sensitive - strict limits)
    LOGIN = "6/minute"              # 6 login attempts per minute per IP (allows 5th to trigger lockout)
    MFA_VERIFY = "3/minute"         # 3 MFA verification attempts per minute per IP (brute-force protection)
    TOKEN_REFRESH = "20/minute"     # 20 token refreshes per minute per IP (higher due to page loads, tabs)
    REGISTER = "3/hour"             # 3 registrations per hour per IP
    PASSWORD_RESET_REQUEST = "3/hour"  # 3 reset requests per hour per email
    PASSWORD_RESET = "5/hour"       # 5 password resets per hour per IP

    # File upload endpoints (resource-intensive)
    FILE_UPLOAD = "10/minute"       # 10 file uploads per minute per user
    AUDIO_UPLOAD = "5/minute"       # 5 audio uploads per minute per user

    # General API endpoints (authenticated)
    API_GENERAL = "100/minute"      # 100 requests per minute per user

    # AI/LLM endpoints (expensive)
    AI_CHAT = "30/minute"           # 30 chat requests per minute per user
    AI_SYNTHESIS = "20/minute"      # 20 synthesis requests per minute per user

    # Admin endpoints (protection against compromised tokens)
    ADMIN_DESTRUCTIVE = "5/hour"    # 5 destructive actions per hour per IP (delete user, delete session, S3 cleanup)
    ADMIN_SENSITIVE = "10/hour"     # 10 sensitive actions per hour per IP (reset password, reset MFA, transfer)
    ADMIN_EMAIL = "20/hour"         # 20 email-sending actions per hour per IP (invitations, notifications)

    # Feedback submission (spam prevention)
    FEEDBACK_SUBMIT = "3/hour"      # 3 feedback submissions per hour per IP

    # Waitlist submission (spam prevention)
    WAITLIST_JOIN = "5/hour"        # 5 waitlist submissions per hour per IP
