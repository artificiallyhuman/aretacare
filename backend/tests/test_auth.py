"""Login, protected routes, admin gating, refresh-token handling and sign-up consents."""

import uuid

import pytest

from app.models import ConsentRecord, ConsentType, CONSENT_VERSIONS
from app.models.user import User
from tests.conftest import TEST_PASSWORD, cookie_header, refresh_cookie_from

REFRESH = "/api/auth/refresh"
NATIVE = {"X-Client-Type": "ios"}


def test_login_succeeds_with_correct_password(client, alice):
    body = alice.login(client).json()
    assert body["access_token"]
    assert body["user"]["email"] == alice.email


def test_login_fails_with_wrong_password(client, alice):
    response = client.post(
        "/api/auth/login", json={"email": alice.email, "password": "not-the-password"}
    )
    assert response.status_code == 401
    assert "access_token" not in response.json()


def test_protected_route_requires_authentication(client):
    # Starlette's bearer scheme has answered a missing header with 403 in older
    # releases and 401 in newer ones; either way the request is refused.
    assert client.get("/api/sessions/").status_code in (401, 403)
    assert client.get(
        "/api/sessions/", headers={"Authorization": "Bearer not-a-real-token"}
    ).status_code == 401


def test_admin_routes_refuse_non_admin(client, alice):
    headers = alice.auth_headers(client)
    assert client.get("/api/admin/metrics", headers=headers).status_code == 403
    assert client.get("/api/admin/users/search?q=test", headers=headers).status_code == 403
    assert client.get("/api/health/detailed", headers=headers).status_code == 403


# --- Refresh tokens -----------------------------------------------------------------
#
# Browsers hold the refresh token in an HttpOnly cookie and must never be handed it in
# a response body. Native clients hold it themselves and present it in the request body.
# A native client can also be carrying a cookie (its HTTP stack keeps a cookie jar), and
# that cookie must never take precedence over the token it actually presented.


def test_browser_login_sets_cookie_and_keeps_token_out_of_body(client, alice):
    response = alice.login(client)
    assert refresh_cookie_from(response)
    assert not response.json().get("refresh_token")


def test_native_refresh_rotates_and_returns_token_in_body(client, alice):
    first = alice.login(client, native=True).json()["refresh_token"]
    assert first

    rotated = client.post(REFRESH, json={"refresh_token": first}, headers=NATIVE)
    assert rotated.status_code == 200
    second = rotated.json()["refresh_token"]
    assert second and second != first

    # The token that was just rotated away is spent.
    replay = client.post(REFRESH, json={"refresh_token": first}, headers=NATIVE)
    assert replay.status_code == 401


def test_native_refresh_returns_body_token_even_when_a_cookie_is_present(client, alice):
    body_token = alice.login(client, native=True).json()["refresh_token"]
    stray_cookie = refresh_cookie_from(alice.login(client))

    response = client.post(
        REFRESH,
        json={"refresh_token": body_token},
        headers={**NATIVE, **cookie_header(stray_cookie)},
    )
    assert response.status_code == 200
    assert response.json()["refresh_token"]
    # No new cookie for a native client: it would shadow the stored token next time.
    assert not any(
        header.startswith("refresh_token=") and "Max-Age=0" not in header
        and 'refresh_token=""' not in header
        for header in response.headers.get_list("set-cookie")
    )


def test_cookie_only_caller_never_gets_token_in_body(client, alice):
    cookie = refresh_cookie_from(alice.login(client))

    # Claiming to be a native client is not enough to be treated as one.
    response = client.post(REFRESH, headers={**NATIVE, **cookie_header(cookie)})
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert not response.json().get("refresh_token")
    assert refresh_cookie_from(response)


def test_made_up_body_token_is_rejected(client, alice):
    cookie = refresh_cookie_from(alice.login(client))

    without_cookie = client.post(
        REFRESH, json={"refresh_token": "not-a-token-this-server-issued"}, headers=NATIVE
    )
    assert without_cookie.status_code == 401

    # A valid browser cookie does not rescue a body token the server never issued.
    with_cookie = client.post(
        REFRESH,
        json={"refresh_token": "not-a-token-this-server-issued"},
        headers={**NATIVE, **cookie_header(cookie)},
    )
    assert with_cookie.status_code == 401


def test_body_token_wins_over_another_users_cookie(client, alice, bob):
    alice_cookie = refresh_cookie_from(alice.login(client))
    bob_token = bob.login(client, native=True).json()["refresh_token"]

    response = client.post(
        REFRESH,
        json={"refresh_token": bob_token},
        headers={**NATIVE, **cookie_header(alice_cookie)},
    )
    assert response.status_code == 200
    assert response.json()["user"]["email"] == bob.email


def test_spent_token_cannot_be_revived_by_another_users_cookie(client, alice, bob):
    alice_token = alice.login(client, native=True).json()["refresh_token"]
    # Spend alice's token.
    assert client.post(REFRESH, json={"refresh_token": alice_token}, headers=NATIVE).status_code == 200
    bob_cookie = refresh_cookie_from(bob.login(client))

    response = client.post(
        REFRESH,
        json={"refresh_token": alice_token},
        headers={**NATIVE, **cookie_header(bob_cookie)},
    )
    assert response.status_code == 401


def test_logout_revokes_the_presented_token(client, alice):
    token = alice.login(client, native=True).json()["refresh_token"]
    assert client.post("/api/auth/logout", json={"refresh_token": token}).status_code == 200
    assert client.post(REFRESH, json={"refresh_token": token}, headers=NATIVE).status_code == 401


# --- registration consent records ----------------------------------------------

def _register(client, email, headers=None):
    return client.post(
        "/api/auth/register",
        json={
            "name": "Test Signup",
            "email": email,
            "password": TEST_PASSWORD,
            "acknowledge_not_medical_advice": True,
            "acknowledge_hipaa": True,
            "acknowledge_ai_processing": True,
            "agree_to_terms": True,
            "acknowledge_age_and_use": True,
        },
        headers=headers or {},
    )


@pytest.fixture()
def open_signups(monkeypatch, db):
    """Signups without an invitation, no verification email; removes the users it made."""
    from app.api import auth as auth_api

    monkeypatch.setattr(auth_api.settings, "CONTROL_SIGNUPS", False)
    monkeypatch.setattr(auth_api.email_service, "send_registration_verification", lambda **_: None)
    emails = []
    yield emails
    db.rollback()
    if emails:
        db.query(User).filter(User.email.in_(emails)).delete(synchronize_session=False)
        db.commit()


def test_registration_records_every_consent_with_its_current_text_and_ip(client, db, open_signups):
    email = f"test-signup-{uuid.uuid4().hex[:12]}@example.com"
    open_signups.append(email)

    response = _register(client, email, headers={"X-Forwarded-For": "203.0.113.7"})
    assert response.status_code == 201, response.text

    user = db.query(User).filter(User.email == email).one()
    records = {r.consent_type: r for r in db.query(ConsentRecord).filter(ConsentRecord.user_id == user.id)}
    assert set(records) == {
        ConsentType.MEDICAL_ADVICE, ConsentType.HIPAA, ConsentType.DATA_PROCESSING,
        ConsentType.TERMS_PRIVACY, ConsentType.AGE_USE,
    }
    for consent_type, record in records.items():
        assert record.consent_version == CONSENT_VERSIONS[consent_type]["version"]
        assert record.consent_text == CONSENT_VERSIONS[consent_type]["text"]
        assert record.ip_address == "203.0.113.7"
    assert "health information" in records[ConsentType.DATA_PROCESSING].consent_text


def test_a_failed_consent_write_leaves_no_user_behind(client, db, open_signups, monkeypatch):
    from app.api import auth as auth_api

    def broken_consent_record(**_):
        raise RuntimeError("consent write failed")

    monkeypatch.setattr(auth_api, "ConsentRecord", broken_consent_record)
    email = f"test-signup-{uuid.uuid4().hex[:12]}@example.com"
    open_signups.append(email)

    with pytest.raises(RuntimeError):
        _register(client, email)

    db.expire_all()
    assert db.query(User).filter(User.email == email).first() is None
