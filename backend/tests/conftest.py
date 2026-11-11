"""Shared fixtures for the backend smoke tests.

These tests exercise the real application against a real PostgreSQL (with pgvector),
because the behaviour worth protecting — session scoping, token rotation, access
checks — lives in the queries. They make no outbound calls: nothing here reaches
OpenAI, S3 or SMTP, and every route under test returns before it would.

Point DATABASE_URL at a throwaway database. Importing the app creates the schema and
runs the migrations there, and the fixtures add and then remove their own rows.
"""

import os
import uuid

import pytest

# Configuration has to be in the environment before the app is imported: settings are
# read, and the schema is created, at import time. setdefault keeps anything the caller
# (CI, or a developer's shell) has already provided.
_TEST_ENV = {
    # Format-valid placeholders. They only need to pass the startup checks; no test
    # reaches a code path that would use them.
    "OPENAI_API_KEY": "sk-test-placeholder-not-a-real-key",
    "AWS_ACCESS_KEY_ID": "TESTPLACEHOLDERKEY00",
    "AWS_SECRET_ACCESS_KEY": "test-placeholder-secret-not-a-real-key-0000",
    "S3_BUCKET_NAME": "test-placeholder-bucket",
    "SECRET_KEY": "test-only-signing-key-not-used-outside-the-test-suite",
    "SMTP_HOST": "",
    "SENTRY_DSN": "",
    "PUSH_NOTIFICATIONS_ENABLED": "false",
    "RESET_DB": "false",
    "ADMIN_EMAILS": "admin-not-a-test-user@example.com",
}
for _key, _value in _TEST_ENV.items():
    os.environ.setdefault(_key, _value)

# Forced, not defaulted: rate-limit counters must stay in this process so one run cannot
# affect another, and secure-only cookies would complicate nothing here but are not
# what is being tested.
os.environ["REDIS_URL"] = ""
# A just-rotated refresh token may be accepted again for a short grace period, so that a
# client whose response was lost is not signed out. The tests replay tokens immediately
# and expect them to be spent, so the grace period is switched off here.
os.environ["REFRESH_TOKEN_ROTATION_GRACE_SECONDS"] = "0"
# Forced off as well: a developer's local environment may carry a real DSN, and test
# runs must never report into it.
os.environ["SENTRY_DSN"] = ""

if not os.environ.get("DATABASE_URL"):
    raise RuntimeError(
        "DATABASE_URL must point at a disposable PostgreSQL database with pgvector "
        "before running the tests (see backend/tests/README.md)."
    )

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.api.auth import REFRESH_TOKEN_COOKIE_NAME  # noqa: E402
from app.core.auth import get_password_hash  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.models import ConsentRecord, ConsentType, CONSENT_VERSIONS  # noqa: E402
from app.models.session import Session as CareSession  # noqa: E402
from app.models.user import User  # noqa: E402

TEST_PASSWORD = "Correct-Horse-Battery-9!"


@pytest.fixture(scope="session", autouse=True)
def _no_rate_limits():
    """Rate limits are per client address and every test shares one; switch them off."""
    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


@pytest.fixture(scope="session")
def client():
    # Not used as a context manager on purpose: that would run the startup hooks
    # (retention cleanup, periodic tasks), which these tests neither need nor cover.
    return TestClient(app)


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


class Account:
    """A test user plus one care session they own."""

    def __init__(self, user_id, email, session_id):
        self.user_id = user_id
        self.email = email
        self.session_id = session_id
        self.password = TEST_PASSWORD

    def login(self, client, native=False):
        headers = {"X-Client-Type": "ios"} if native else {}
        response = client.post(
            "/api/auth/login",
            json={"email": self.email, "password": self.password},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        return response

    def auth_headers(self, client):
        token = self.login(client).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}


def refresh_cookie_from(response):
    """The refresh token a response set as a cookie, read from the Set-Cookie header.

    Read from the header rather than the client's cookie jar so tests can present a
    cookie explicitly and independently of what the jar would send.
    """
    for header in response.headers.get_list("set-cookie"):
        name, _, rest = header.partition("=")
        if name.strip() == REFRESH_TOKEN_COOKIE_NAME:
            return rest.split(";", 1)[0]
    return None


def cookie_header(token):
    return {"Cookie": f"{REFRESH_TOKEN_COOKIE_NAME}={token}"}


@pytest.fixture()
def make_account(db):
    """Factory for verified users, each with AI-processing consent and one care session.

    Created through the ORM: sign-up is invitation-only by default, and the tests are
    about what an existing user can reach, not about registration.
    """
    created_user_ids = []
    created_emails = []

    def _make(label="user"):
        suffix = uuid.uuid4().hex[:12]
        user = User(
            name=f"Test {label.title()}",
            email=f"test-{label}-{suffix}@example.com",
            password_hash=get_password_hash(TEST_PASSWORD),
            is_email_verified=True,
        )
        db.add(user)
        db.flush()
        consent = CONSENT_VERSIONS[ConsentType.AI_DATA_SHARING]
        db.add(ConsentRecord(
            user_id=user.id,
            consent_type=ConsentType.AI_DATA_SHARING,
            consent_version=consent["version"],
            consent_text=consent["text"],
        ))
        care_session = CareSession(user_id=user.id, owner_id=user.id, name=f"{label[:8]} care")
        db.add(care_session)
        db.commit()
        created_user_ids.append(user.id)
        created_emails.append(user.email)
        return Account(user.id, user.email, care_session.id)

    yield _make

    # Every table hangs off users/sessions with ON DELETE CASCADE, so removing the users
    # removes everything the tests created. Security-log rows are keyed by plain strings
    # and are cleaned up separately.
    from app.models.security_log import SecurityLog

    db.rollback()
    if created_user_ids:
        db.query(SecurityLog).filter(
            SecurityLog.user_id.in_(created_user_ids) | SecurityLog.email.in_(created_emails)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(created_user_ids)).delete(synchronize_session=False)
        db.commit()


@pytest.fixture()
def alice(make_account):
    return make_account("alice")


@pytest.fixture()
def bob(make_account):
    return make_account("bob")
