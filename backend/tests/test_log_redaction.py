"""Log lines carry no email addresses and no query-string values beyond counts and dates.

Also: system writes to a chat message don't mark it "(edited)".
"""

import logging

from uvicorn.logging import AccessFormatter

import app.main  # noqa: F401  (installs the log-record factory)
from app.core.log_redaction import mask_emails, redact_query
from app.models.conversation import Conversation, MessageRole
from app.services import talk_session_service


class _Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append(record)


def _capture(logger_name):
    handler = _Capture()
    logger = logging.getLogger(logger_name)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger, handler


def test_mask_emails():
    assert mask_emails("Invitation sent to pat.example@example.com") == "Invitation sent to p***@example.com"
    assert mask_emails("from a@b.example.org and z_9@example.co") == "from a***@b.example.org and z***@example.co"
    assert mask_emails("no address here, just text @ noon") == "no address here, just text @ noon"


def test_redact_query_keeps_names_and_safe_values():
    assert redact_query("/api/auth/verify-email?token=synthetic-secret") == "/api/auth/verify-email?token=[redacted]"
    assert (
        redact_query("/api/journal/abc?search=chemo+side+effects&limit=20&offset=0")
        == "/api/journal/abc?search=[redacted]&limit=20&offset=0"
    )
    assert redact_query("/api/health") == "/api/health"


def test_app_log_lines_mask_email_addresses():
    logger, handler = _capture("app.test_log_redaction")
    try:
        logger.info(f"Invitation email sent successfully to {'pat@example.com'}")
        logger.info("Verification email resent to: %s", "sam.q@example.org")
        logger.info("Nothing personal, %d items", 3)
    finally:
        logger.removeHandler(handler)
    messages = [r.getMessage() for r in handler.records]
    assert messages == [
        "Invitation email sent successfully to p***@example.com",
        "Verification email resent to: s***@example.org",
        "Nothing personal, 3 items",
    ]


def test_access_log_redacts_query_values_and_still_formats():
    logger, handler = _capture("uvicorn.access")
    try:
        logger.info(
            '%s - "%s %s HTTP/%s" %d',
            "10.0.0.1:5000", "GET", "/api/auth/verify-email?token=abc123", "1.1", 200,
        )
    finally:
        logger.removeHandler(handler)
    line = AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s').format(handler.records[0])
    assert "abc123" not in line
    assert "/api/auth/verify-email?token=[redacted]" in line


def test_filling_in_a_talk_card_does_not_mark_it_edited(client, db, alice):
    card = Conversation(session_id=alice.session_id, role=MessageRole.ASSISTANT, content="Saving…")
    db.add(card)
    db.commit()

    talk_session_service._update_card(card.id, alice.session_id, "Talk conversation (24 sec).", {"kind": "talk_summary"})

    db.refresh(card)
    assert card.content == "Talk conversation (24 sec)."
    assert card.updated_at is None


def test_a_user_edit_still_marks_the_message_edited(client, db, alice):
    message = Conversation(session_id=alice.session_id, role=MessageRole.USER, content="First draft")
    db.add(message)
    db.commit()

    response = client.patch(
        f"/api/conversation/{message.id}",
        json={"content": "Second draft"},
        headers=alice.auth_headers(client),
    )
    assert response.status_code == 200, response.text
    assert response.json()["updated_at"] is not None
