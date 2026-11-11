"""Request size limits, input length limits and the authenticator-setup guard."""

from app.models.user_totp_secret import UserTOTPSecret

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
