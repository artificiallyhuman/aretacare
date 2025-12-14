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
    Get client IP address, respecting X-Forwarded-For header for proxied requests.
    Falls back to direct client IP if header not present.
    """
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
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
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
