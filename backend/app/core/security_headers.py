"""
Security headers middleware for AretaCare API.

Adds standard security headers to all responses to protect against
common web vulnerabilities like clickjacking, MIME sniffing, and XSS.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all HTTP responses.

    Headers added:
    - X-Content-Type-Options: Prevents MIME type sniffing
    - X-Frame-Options: Prevents clickjacking attacks
    - X-XSS-Protection: Legacy XSS protection (for older browsers)
    - Referrer-Policy: Controls referrer information sent with requests
    - Permissions-Policy: Restricts browser features
    - Content-Security-Policy: Controls resource loading (report-only for now)

    Note: Strict-Transport-Security (HSTS) should be configured at the
    reverse proxy/load balancer level in production, not in the application.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking - allow framing only from same origin
        response.headers["X-Frame-Options"] = "SAMEORIGIN"

        # Legacy XSS protection for older browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referrer information
        # strict-origin-when-cross-origin: Send full URL for same-origin,
        # only origin for cross-origin, nothing for downgrade
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restrict browser features we don't use
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), "
            "camera=(), "
            "geolocation=(), "
            "gyroscope=(), "
            "magnetometer=(), "
            "microphone=(self), "  # Allow microphone for audio recording feature
            "payment=(), "
            "usb=()"
        )

        # Content Security Policy
        # Using a permissive policy to avoid breaking functionality
        # This should be tightened based on actual resource needs
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://*.amazonaws.com https://api.openai.com; "
            "frame-ancestors 'self'; "
            "form-action 'self'; "
            "base-uri 'self'"
        )

        return response
