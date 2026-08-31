"""
Rate limiting configuration for AretaCare API.

Uses slowapi to implement rate limiting based on client IP address.
Different limits are applied to different endpoint categories.
"""

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse
import logging
import time

from app.core.client_ip import get_client_ip
from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_limiter() -> Limiter:
    """Create the limiter, backed by Redis when one is configured.

    slowapi's default storage is an in-process dict. That is fine for a single instance,
    but this service autoscales: with N instances behind the load balancer each keeps its
    own counters, so a "6/minute" login limit really allows up to N x 6 per minute, and
    every deploy or scale event resets all of them to zero. Sharing the counters in Redis
    makes the configured numbers mean what they say.

    Falls back to in-memory when REDIS_URL is unset so local development and tests need no
    extra service.
    """
    if settings.REDIS_URL:
        try:
            instance = Limiter(key_func=get_client_ip, storage_uri=settings.REDIS_URL)
            logger.info("Rate limiting backed by shared Redis storage")
            return instance
        except Exception as e:
            # Never let a rate-limit backend problem stop the app from booting; degrade to
            # in-memory (weaker, but still enforcing) and make the degradation loud.
            logger.error(
                "Failed to initialise Redis rate-limit storage (%s). Falling back to "
                "per-process memory — limits will be weaker than configured.", e
            )

    if not settings.DEBUG:
        logger.warning(
            "REDIS_URL is not set: rate limiting is per-process. If more than one "
            "instance serves traffic, effective limits are multiplied by the instance count."
        )

    return Limiter(key_func=get_client_ip)


limiter = _build_limiter()


def cleanup_rate_limit_storage():
    """Evict expired entries from the in-memory rate limit storage.

    slowapi's default MemoryStorage keeps expired counters in its internal dict
    indefinitely (they're only checked on access). Over time with many unique IPs,
    this dict grows without bound. This function removes entries whose TTL has
    passed, and should be called periodically (e.g. every hour).

    No-op when Redis-backed — Redis expires keys itself. The hasattr guard below
    handles that case.
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
    PASSWORD_RESET_REQUEST = "3/hour"  # 3 reset requests per hour per IP (plus per-account throttle in auth)
    PASSWORD_RESET = "5/hour"       # 5 password resets per hour per IP

    # File upload endpoints (resource-intensive)
    FILE_UPLOAD = "10/minute"       # 10 file uploads per minute per user
    AUDIO_UPLOAD = "10/minute"      # 10 audio uploads per minute per IP — the upload now returns in
                                    # seconds (transcription is a background job), so a batch of
                                    # files arrives quickly; clients honor retry_after on 429

    # General API endpoints (authenticated)
    API_GENERAL = "100/minute"      # 100 requests per minute per user

    # AI/LLM endpoints (expensive)
    AI_CHAT = "30/minute"           # 30 chat requests per minute per user
    AI_SYNTHESIS = "20/minute"      # 20 synthesis requests per minute per user
    AI_TOOLS = "10/minute"          # 10 tool requests per minute per IP (publicly accessible)

    # Admin endpoints (protection against compromised tokens)
    ADMIN_DESTRUCTIVE = "5/hour"    # 5 destructive actions per hour per IP (delete user, delete session, S3 cleanup)
    ADMIN_SENSITIVE = "10/hour"     # 10 sensitive actions per hour per IP (reset password, reset MFA, transfer)
    ADMIN_EMAIL = "20/hour"         # 20 email-sending actions per hour per IP (invitations, notifications)

    # File download / presigned URL endpoints (prevent bulk exfiltration)
    PRESIGNED_URL = "30/minute"     # 30 presigned URL generations per minute per user

    # Feedback submission (spam prevention)
    FEEDBACK_SUBMIT = "3/hour"      # 3 feedback submissions per hour per IP

    # Waitlist submission (spam prevention)
    WAITLIST_JOIN = "5/hour"        # 5 waitlist submissions per hour per IP

    # Public unsubscribe endpoints (hygiene only — the 256-bit token is the real
    # control; kept generous because provider one-click POSTs share egress IPs)
    UNSUBSCRIBE = "20/minute"
