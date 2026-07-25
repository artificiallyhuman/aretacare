"""
Sentry initialization with strict PII/PHI scrubbing.

AretaCare handles sensitive health information. Nothing that could contain
user content (request bodies, headers, cookies, query strings, emails) may
be sent to Sentry. Events carry only: exception type/stack trace, route
path, HTTP method, and status.

Disabled entirely when SENTRY_DSN is empty (the local-dev default).
"""

import logging
import os

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber

from app.core.config import settings

logger = logging.getLogger(__name__)

# Headers that carry credentials or device/MFA trust material
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-mfa-action-token",
    "x-trusted-device",
}

# Field names scrubbed anywhere they appear in event payloads. Extends
# Sentry's defaults with AretaCare-specific content fields (journal text,
# chat messages, transcripts) and identity fields.
SCRUB_DENYLIST = DEFAULT_DENYLIST + [
    "email",
    "name",
    "content",
    "message",
    "text",
    "transcript",
    "journal",
    "body",
    "token",
    "refresh_token",
    "access_token",
]


def _before_send(event, hint):
    request = event.get("request")
    if request:
        request.pop("data", None)  # never send request bodies
        request.pop("cookies", None)
        request.pop("query_string", None)  # reset/verify tokens appear in queries
        headers = request.get("headers") or {}
        request["headers"] = {
            k: v for k, v in headers.items() if k.lower() not in SENSITIVE_HEADERS
        }
    # send_default_pii=False already prevents user context; belt-and-braces
    # in case a scope ever sets it explicitly.
    event.pop("user", None)
    return event


def _before_breadcrumb(crumb, hint):
    # httpx/boto3 breadcrumbs can carry presigned-S3/OpenAI URLs with tokens
    # in the query string — keep only scheme://host/path.
    if crumb.get("category") in ("httplib", "http", "httpx", "subprocess"):
        data = crumb.get("data") or {}
        url = data.get("url")
        if url and "?" in url:
            data["url"] = url.split("?", 1)[0]
        data.pop("http.query", None)
        data.pop("http.fragment", None)
    return crumb


def _traces_sampler(sampling_context):
    # Render pings /api/health constantly — those transactions would
    # dominate a 10% sample.
    asgi_scope = sampling_context.get("asgi_scope") or {}
    if asgi_scope.get("path") == "/api/health":
        return 0.0
    return settings.SENTRY_TRACES_SAMPLE_RATE


def init_sentry() -> None:
    if not settings.SENTRY_DSN:
        logger.info("Sentry disabled (no SENTRY_DSN)")
        return

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        release=os.getenv("RENDER_GIT_COMMIT") or None,
        send_default_pii=False,
        max_request_body_size="never",
        traces_sampler=_traces_sampler,
        before_send=_before_send,
        before_breadcrumb=_before_breadcrumb,
        event_scrubber=EventScrubber(denylist=SCRUB_DENYLIST, recursive=True),
        integrations=[
            # ERROR-level log lines become breadcrumbs, not events — formatted
            # log strings may embed user data. Events come only from unhandled
            # exceptions and explicit capture_exception calls.
            LoggingIntegration(level=logging.INFO, event_level=None),
        ],
    )
    logger.info(f"✓ Sentry initialized (environment: {settings.SENTRY_ENVIRONMENT})")
