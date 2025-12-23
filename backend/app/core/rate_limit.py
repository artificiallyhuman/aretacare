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
    elif "/auth/password-reset" in path:
        message = "Too many password reset attempts. Please try again later."
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
    LOGIN = "5/minute"              # 5 login attempts per minute per IP
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

    # Feedback submission (spam prevention)
    FEEDBACK_SUBMIT = "3/hour"      # 3 feedback submissions per hour per IP

    # Waitlist submission (spam prevention)
    WAITLIST_JOIN = "5/hour"        # 5 waitlist submissions per hour per IP
