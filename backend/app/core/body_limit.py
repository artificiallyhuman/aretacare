"""
Request body size limit, enforced before the application reads the body.

Route handlers only see a request after the framework has parsed it, and form
parsing happens before dependencies (authentication, rate limiting) run. A size
check inside a handler therefore bounds what the handler keeps, not what the
server was willing to receive. This middleware sits outside everything else and
caps the body at the ASGI layer:

- a declared Content-Length over the limit is refused with 413 immediately,
  before any of the body is read;
- bodies without a usable Content-Length (chunked transfer) are counted as they
  stream in and cut off at the limit.

Pure ASGI (no BaseHTTPMiddleware) so the body is never buffered here.
"""

import json
import logging
from typing import Dict, Iterable, Optional

logger = logging.getLogger(__name__)

DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024  # JSON API requests

# Multipart framing (boundaries, part headers, the other form fields) rides on top
# of the file itself, so upload paths get the file limit plus this margin.
MULTIPART_OVERHEAD_FACTOR = 1.1


def upload_body_limit(max_file_bytes: int) -> int:
    """Body limit for a multipart route whose file may be up to max_file_bytes."""
    return int(max_file_bytes * MULTIPART_OVERHEAD_FACTOR)


class BodySizeLimitMiddleware:
    def __init__(
        self,
        app,
        default_limit: int = DEFAULT_MAX_BODY_BYTES,
        path_limits: Optional[Dict[str, int]] = None,
        allowed_origins: Optional[Iterable[str]] = None,
    ):
        self.app = app
        self.default_limit = default_limit
        self.path_limits = {
            path.rstrip("/"): limit for path, limit in (path_limits or {}).items()
        }
        self.allowed_origins = set(allowed_origins or [])

    def _limit_for(self, path: str) -> int:
        return self.path_limits.get(path.rstrip("/"), self.default_limit)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self._limit_for(scope.get("path", ""))
        headers = dict(scope.get("headers") or [])

        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                declared_length = int(declared)
            except ValueError:
                declared_length = None
            if declared_length is not None and declared_length > limit:
                logger.warning(
                    "Rejected request body over limit: %s bytes declared on %s (limit %s)",
                    declared_length, scope.get("path"), limit,
                )
                await self._send_too_large(send, headers, limit)
                return

        received = 0
        rejected = False
        response_started = False

        async def limited_receive():
            nonlocal received, rejected
            if rejected:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    rejected = True
                    logger.warning(
                        "Cut off request body over limit on %s (limit %s)",
                        scope.get("path"), limit,
                    )
                    if not response_started:
                        await self._send_too_large(send, headers, limit)
                    # The application sees a disconnect and stops reading.
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message):
            nonlocal response_started
            if rejected:
                # The 413 has already gone out; drop whatever the app sends now.
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            # Once the body is cut off the application sees a client disconnect, which
            # it may surface as an exception. The 413 is already sent, so that is
            # expected; anything raised on a request that was not cut off is real.
            if not rejected:
                raise

    async def _send_too_large(self, send, request_headers, limit: int) -> None:
        body = json.dumps({
            "detail": f"Request is too large. The maximum size is {limit // (1024 * 1024)} MB."
        }).encode("utf-8")
        response_headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            # The rest of the body is not read, so the connection cannot be reused.
            (b"connection", b"close"),
        ]
        # This response never passes through the CORS middleware, so mirror its
        # allow-origin decision here; otherwise a browser reports a generic network
        # error instead of the 413.
        origin = request_headers.get(b"origin")
        if origin and origin.decode("latin-1") in self.allowed_origins:
            response_headers += [
                (b"access-control-allow-origin", origin),
                (b"access-control-allow-credentials", b"true"),
                (b"vary", b"Origin"),
            ]
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": response_headers,
        })
        await send({"type": "http.response.body", "body": body})
