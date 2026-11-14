"""Keep personal data out of log lines.

Log output goes to Render's log store (and, as breadcrumbs, to Sentry), where nobody
needs a user's address or a query string. Installed once, at the top of `main.py`, as
a log-record factory, so it applies to every logger — ours, uvicorn's, libraries' — and
to every consumer of the record, including Sentry's logging integration, which reads
records before any handler (and so any handler filter) sees them.

- Email addresses in a message keep their first character and domain: `r***@example.com`.
- uvicorn access lines keep the path and query parameter names, but only the values of
  `SAFE_QUERY_KEYS`. Others carry one-time tokens (`/auth/verify-email?token=`) and
  free text (journal search, which can be health terms; admin user search by email).
"""

import logging
import re
from urllib.parse import parse_qsl, urlencode

_EMAIL = re.compile(r"([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})")

# Values that are counts, dates, flags, IDs or fixed categories.
SAFE_QUERY_KEYS = frozenset({
    "limit", "offset", "page", "days", "before_id",
    "user_date", "date", "start_date", "end_date",
    "background", "skip_journal_synthesis", "include_recipients",
    "category", "session_id",
})

REDACTED = "[redacted]"

_installed = False


def mask_emails(text: str) -> str:
    return _EMAIL.sub(r"\1***@\2", text)


def redact_query(path: str) -> str:
    """`/path?token=abc&limit=20` → `/path?token=[redacted]&limit=20`."""
    path, sep, query = path.partition("?")
    if not sep:
        return path
    pairs = [
        (key, value if key in SAFE_QUERY_KEYS else REDACTED)
        for key, value in parse_qsl(query, keep_blank_values=True)
    ]
    return f"{path}?{urlencode(pairs, safe='[]')}"


def _redact(record: logging.LogRecord) -> None:
    # uvicorn's AccessFormatter unpacks exactly these five args, so keep the shape.
    if record.name == "uvicorn.access" and isinstance(record.args, tuple) and len(record.args) == 5:
        args = list(record.args)
        args[2] = redact_query(str(args[2]))
        record.args = tuple(args)
        return
    message = record.getMessage()
    masked = mask_emails(message)
    if masked != message:
        record.msg, record.args = masked, None


def install_log_redaction() -> None:
    global _installed
    if _installed:
        return
    _installed = True
    make_record = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = make_record(*args, **kwargs)
        try:
            _redact(record)
        except Exception:
            # A message whose args don't format fails the same way in the handler,
            # which reports it; never let redaction raise into the caller.
            pass
        return record

    logging.setLogRecordFactory(factory)
