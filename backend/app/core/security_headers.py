"""
Security headers middleware for AretaCare API.

Adds standard security headers to all responses to protect against
common web vulnerabilities like clickjacking, MIME sniffing, and XSS.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from app.core.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all HTTP responses.

    Headers added:
    - Strict-Transport-Security: Forces HTTPS connections (production only)
    - X-Content-Type-Options: Prevents MIME type sniffing
    - X-Frame-Options: Prevents clickjacking attacks
    - X-XSS-Protection: Legacy XSS protection (for older browsers)
    - Referrer-Policy: Controls referrer information sent with requests
    - Permissions-Policy: Restricts browser features
    - Content-Security-Policy: Controls resource loading
    - Cache-Control: no-store for API responses (user data must not be cached)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # HSTS: Force HTTPS for 1 year, include subdomains
        # Only enable in production to avoid locking out local development
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

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
        # Tightened policy for production security:
        # - script-src: No unsafe-inline or unsafe-eval (Vite builds external JS files)
        # - style-src: unsafe-inline required for Tailwind CSS and React inline styles
        # - connect-src: Allow S3 for file uploads and hCaptcha for spam prevention
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://js.hcaptcha.com https://newassets.hcaptcha.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://*.amazonaws.com https://api.openai.com https://hcaptcha.com https://*.hcaptcha.com; "
            "frame-src 'self' https://www.youtube.com https://newassets.hcaptcha.com https://*.hcaptcha.com; "
            "frame-ancestors 'self'; "
            "form-action 'self'; "
            "base-uri 'self'"
        )

        # API responses contain user data and must never be written to
        # browser or intermediary caches. Endpoints can opt out by setting
        # their own Cache-Control header.
        if request.url.path.startswith("/api") and "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"

        return response
