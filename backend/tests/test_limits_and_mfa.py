"""Request size limits, input length limits, the authenticator-setup guard, and step-up on MFA changes."""

import pytest

from app.models.user import User
from app.models.user_totp_secret import UserTOTPSecret
from app.services.mfa_service import MFAService

JARGON = "/api/tools/jargon-translator"


def test_oversized_request_body_is_refused(client):
    # Well over the default limit for JSON routes. Refused on size alone, before the
    # body is parsed or the route runs.
    payload = b'{"medical_term": "' + b"a" * (3 * 1024 * 1024) + b'"}'
    response = client.post(JARGON, content=payload, headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    assert "detail" in response.json()


def test_overlong_tool_input_is_rejected(client):
    # Small enough to pass the body limit, too long for the field. Rejected before any
    # model call, so this test needs no network.
    response = client.post(JARGON, json={"medical_term": "a" * 5000})
    assert response.status_code in (400, 422)
    assert isinstance(response.json()["detail"], str)


def test_totp_setup_is_refused_when_an_authenticator_is_already_verified(client, db, alice):
    db.add(UserTOTPSecret(user_id=alice.user_id, secret_encrypted="placeholder", verified=True))
    db.commit()

    response = client.post("/api/mfa/totp/setup", headers=alice.auth_headers(client))
    assert response.status_code == 400

    # The stored secret was not replaced or un-verified by the attempt.
    db.expire_all()
    record = db.query(UserTOTPSecret).filter(UserTOTPSecret.user_id == alice.user_id).one()
    assert record.verified is True
    assert record.secret_encrypted == "placeholder"


# --- Step-up on adding a factor and turning MFA off ---------------------------------
#
# With MFA on, a stolen access token alone must not be able to add the attacker's own
# factor (which then passes every later step-up) or switch MFA off. iOS builds before
# 2.0.0 cannot answer the demand and stay exempt while STEP_UP_EXEMPT_LEGACY_IOS is on.

ADD_FACTOR_ROUTES = ["/api/mfa/passkey/register/options", "/api/mfa/totp/setup"]


def _signed_in_with_mfa_on(client, db, account):
    """Auth headers for a user whose MFA is on (signed in first: with MFA on, a plain
    password login returns a challenge instead of a token)."""
    headers = account.auth_headers(client)
    db.query(User).filter(User.id == account.user_id).update({"mfa_enabled": True})
    db.commit()
    return headers


def _with_action_token(db, account, headers):
    return {**headers, "X-MFA-Action-Token": MFAService.create_action_token(db, account.user_id)}


@pytest.mark.parametrize("path", ADD_FACTOR_ROUTES)
def test_adding_a_factor_needs_step_up_when_mfa_is_on(client, db, alice, path):
    headers = _signed_in_with_mfa_on(client, db, alice)

    refused = client.post(path, headers=headers)
    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "MFA_REQUIRED"

    allowed = client.post(path, headers=_with_action_token(db, alice, headers))
    assert allowed.status_code == 200, allowed.text


@pytest.mark.parametrize("path", ADD_FACTOR_ROUTES)
def test_adding_the_first_factor_needs_no_step_up(client, alice, path):
    # MFA off: there is nothing to verify with yet.
    assert client.post(path, headers=alice.auth_headers(client)).status_code == 200


@pytest.mark.parametrize("app_version, exempt", [
    (None, True),       # iOS builds before 1.0.9 send no version
    ("1.0.9", True),
    ("1.12.3", True),
    ("2.0.0", False),
    ("2.1", False),
])
def test_ios_builds_before_2_0_are_exempt_until_the_setting_is_off(client, db, alice, monkeypatch, app_version, exempt):
    from app.api import mfa as mfa_api

    headers = {**_signed_in_with_mfa_on(client, db, alice), "X-Client-Type": "ios"}
    if app_version:
        headers["X-App-Version"] = app_version
    path = "/api/mfa/passkey/register/options"

    assert client.post(path, headers=headers).status_code == (200 if exempt else 403)

    monkeypatch.setattr(mfa_api.settings, "STEP_UP_EXEMPT_LEGACY_IOS", False)
    assert client.post(path, headers=headers).status_code == 403


def test_turning_mfa_off_needs_the_password_and_then_step_up(client, db, alice):
    headers = _signed_in_with_mfa_on(client, db, alice)

    # The password is checked first, so a wrong one fails without a verification prompt.
    wrong = client.post("/api/mfa/disable", json={"password": "not-the-password"}, headers=headers)
    assert wrong.status_code == 401

    refused = client.post("/api/mfa/disable", json={"password": alice.password}, headers=headers)
    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "MFA_REQUIRED"
    db.expire_all()
    assert db.get(User, alice.user_id).mfa_enabled is True

    done = client.post(
        "/api/mfa/disable",
        json={"password": alice.password},
        headers=_with_action_token(db, alice, headers),
    )
    assert done.status_code == 200, done.text
    db.expire_all()
    assert db.get(User, alice.user_id).mfa_enabled is False
