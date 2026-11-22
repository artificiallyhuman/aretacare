"""Admin email campaigns: delivery over one SMTP connection, what a refusal does to the
run, and "Retry failed".

The send job runs directly (not on its thread) against a scripted fake SMTP server, with
the job's sleeps recorded instead of slept.
"""
import smtplib
import uuid
from datetime import datetime, timedelta

import pytest

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AdminAuditLog
from app.models.email_campaign import EmailCampaign, EmailCampaignRecipient
from app.models.user import User
from app.services import email_campaign_service, email_service

CAMPAIGNS = "/api/admin/email/campaigns"


@pytest.fixture()
def admin(make_account, monkeypatch):
    account = make_account("admin")
    monkeypatch.setattr(settings, "ADMIN_EMAILS", account.email)
    return account


@pytest.fixture(autouse=True)
def _no_campaigns_left_behind(db):
    yield
    db.rollback()
    db.query(EmailCampaign).delete(synchronize_session=False)
    db.query(AdminAuditLog).filter(AdminAuditLog.target_type == "email_campaign").delete(
        synchronize_session=False
    )
    db.commit()


@pytest.fixture()
def make_users(db):
    """Recipients without the cost of a password hash each; nobody signs in as them."""
    created = []

    def _make(count):
        users = []
        for _ in range(count):
            user = User(
                name="Recipient",
                email=f"test-recipient-{uuid.uuid4().hex[:12]}@example.com",
                password_hash="not-a-usable-hash",
                is_email_verified=True,
            )
            db.add(user)
            users.append(user)
        db.commit()
        created.extend(u.id for u in users)
        return users

    yield _make
    db.rollback()
    if created:
        db.query(User).filter(User.id.in_(created)).delete(synchronize_session=False)
        db.commit()


class FakeSMTPState:
    def __init__(self):
        self.connections = 0
        self.logins = 0
        self.attempts = []  # every send_message call, by recipient address
        self.sent = []
        self.login_error = None
        self.on_send = None  # (address, attempt_number_for_address) -> exception or None


@pytest.fixture()
def smtp(monkeypatch):
    state = FakeSMTPState()

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            state.connections += 1

        def starttls(self, context=None):
            pass

        def login(self, user, password):
            state.logins += 1
            if state.login_error is not None:
                raise state.login_error

        def send_message(self, message):
            address = message["To"]
            state.attempts.append(address)
            error = state.on_send(address, state.attempts.count(address)) if state.on_send else None
            if error is not None:
                raise error
            state.sent.append(address)

        def quit(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "test-app-password")
    return state


class FakeTime:
    """Stands in for the job's `time` module: records sleeps and, for each, the
    campaign's paused_until at that moment."""

    def __init__(self):
        self.sleeps = []
        self.paused_during = []
        self.campaign_id = None

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        if self.campaign_id:
            with SessionLocal() as session:
                campaign = session.get(EmailCampaign, self.campaign_id)
                self.paused_during.append(campaign.paused_until)


@pytest.fixture()
def clock(monkeypatch):
    fake = FakeTime()
    monkeypatch.setattr(email_campaign_service, "time", fake)
    return fake


def _make_campaign(db, users, status="pending", outcomes=None, updated_at=None):
    """A campaign row plus one recipient per user. `outcomes` optionally gives each
    recipient a finished (status, error) instead of pending."""
    campaign = EmailCampaign(
        admin_email="admin@example.com",
        subject="What's new",
        body_html="<p>News</p>",
        body_text="News",
        status=status,
        total_recipients=len(users),
        updated_at=updated_at or datetime.utcnow(),
    )
    db.add(campaign)
    db.flush()
    for index, user in enumerate(users):
        row_status, error = outcomes[index] if outcomes else ("pending", None)
        db.add(EmailCampaignRecipient(
            campaign_id=campaign.id, user_id=user.id, email=user.email, name=user.name,
            status=row_status, error=error,
            sent_at=datetime.utcnow() if row_status == "sent" else None,
        ))
    db.commit()
    counts = email_campaign_service._recount(db, campaign.id)
    campaign.sent_count = counts["sent"]
    campaign.failed_count = counts["failed"]
    campaign.skipped_count = counts["skipped"]
    db.commit()
    return campaign.id


def _recipients(db, campaign_id):
    db.expire_all()
    rows = db.query(EmailCampaignRecipient).filter(
        EmailCampaignRecipient.campaign_id == campaign_id
    ).order_by(EmailCampaignRecipient.id).all()
    return {row.email: row for row in rows}


def _campaign(db, campaign_id):
    db.expire_all()
    return db.get(EmailCampaign, campaign_id)


def _throttle_reply():
    return smtplib.SMTPDataError(421, b"4.7.0 Try again later, closing connection.")


# --- Delivery -----------------------------------------------------------------------


def test_one_connection_carries_many_messages(db, make_users, smtp, clock, monkeypatch):
    monkeypatch.setattr(email_campaign_service, "CAMPAIGN_MESSAGES_PER_CONNECTION", 2)
    users = make_users(5)
    campaign_id = _make_campaign(db, users)

    email_campaign_service._run_campaign_send(campaign_id)

    assert sorted(smtp.sent) == sorted(u.email for u in users)
    assert smtp.logins == 3  # 2 + 2 + 1, not one login per message
    assert clock.sleeps == [email_campaign_service.CAMPAIGN_SEND_INTERVAL_SECONDS] * 4
    campaign = _campaign(db, campaign_id)
    assert (campaign.status, campaign.sent_count, campaign.failed_count) == ("completed", 5, 0)


def test_a_temporary_refusal_waits_and_tries_the_same_recipient_again(db, make_users, smtp, clock):
    users = make_users(3)
    second = users[1].email
    smtp.on_send = lambda address, attempt: _throttle_reply() if address == second and attempt <= 2 else None
    campaign_id = _make_campaign(db, users)
    clock.campaign_id = campaign_id

    email_campaign_service._run_campaign_send(campaign_id)

    assert smtp.attempts.count(second) == 3
    assert sorted(smtp.sent) == sorted(u.email for u in users)
    # Immediate retry on a fresh connection, then a 30-second wait shown to the admin.
    assert 30 in clock.sleeps
    assert clock.paused_during[clock.sleeps.index(30)] is not None
    campaign = _campaign(db, campaign_id)
    assert campaign.status == "completed"
    assert campaign.paused_until is None


def test_a_throttle_that_never_clears_stops_the_run(db, make_users, smtp, clock):
    users = make_users(4)
    second = users[1].email
    smtp.on_send = lambda address, attempt: _throttle_reply() if address == second else None
    campaign_id = _make_campaign(db, users)

    email_campaign_service._run_campaign_send(campaign_id)

    # One attempt plus one per retry delay, then nothing more is sent.
    assert smtp.attempts == [users[0].email] + [second] * (1 + len(email_campaign_service.CAMPAIGN_TEMPORARY_RETRY_DELAYS))
    waited = sum(s for s in clock.sleeps if s != email_campaign_service.CAMPAIGN_SEND_INTERVAL_SECONDS)
    assert waited == sum(email_campaign_service.CAMPAIGN_TEMPORARY_RETRY_DELAYS)

    rows = _recipients(db, campaign_id)
    assert rows[users[0].email].status == "sent"
    assert rows[second].error == "smtp_throttled"
    assert rows[second].error_detail.startswith("421 4.7.0 Try again later")
    for user in users[2:]:
        assert rows[user.email].status == "failed"
        assert rows[user.email].error == "smtp_throttled"
        assert rows[user.email].error_detail.startswith("Not attempted")
    campaign = _campaign(db, campaign_id)
    assert (campaign.status, campaign.sent_count, campaign.failed_count) == ("completed_with_errors", 1, 3)
    assert campaign.paused_until is None


def test_a_refused_login_stops_the_run_at_once(db, make_users, smtp, clock):
    smtp.login_error = smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted.")
    users = make_users(3)
    campaign_id = _make_campaign(db, users)

    email_campaign_service._run_campaign_send(campaign_id)

    assert smtp.logins == 1
    assert smtp.attempts == []
    rows = _recipients(db, campaign_id)
    assert {row.error for row in rows.values()} == {"smtp_auth_failed"}
    assert all(email_campaign_service.is_retryable(r.status, r.error) for r in rows.values())
    assert _campaign(db, campaign_id).status == "failed"


def test_a_refused_address_fails_only_that_recipient(db, make_users, smtp, clock):
    users = make_users(3)
    bad = users[1].email
    smtp.on_send = lambda address, attempt: (
        smtplib.SMTPRecipientsRefused({address: (550, b"5.1.1 The email account does not exist.")})
        if address == bad else None
    )
    campaign_id = _make_campaign(db, users)

    email_campaign_service._run_campaign_send(campaign_id)

    assert sorted(smtp.sent) == sorted([users[0].email, users[2].email])
    assert smtp.logins == 1  # the connection survives a refused address
    row = _recipients(db, campaign_id)[bad]
    assert (row.status, row.error) == ("failed", "recipient_rejected")
    assert not email_campaign_service.is_retryable(row.status, row.error)


def test_transactional_mail_retries_only_temporary_failures(monkeypatch, smtp):
    monkeypatch.setattr(email_service, "time", FakeTime())
    message = email_service.EmailService.build_admin_campaign_message(
        to_email="someone@example.com", user_name="Someone", subject="Hi",
        body_html="<p>Hi</p>", body_text="Hi", unsubscribe_url="https://example.com/u",
    )

    smtp.on_send = lambda address, attempt: smtplib.SMTPDataError(552, b"5.3.4 Message too big")
    assert email_service.EmailService._send_with_retry(message) is False
    assert len(smtp.attempts) == 1

    smtp.attempts.clear()
    smtp.on_send = lambda address, attempt: _throttle_reply() if attempt == 1 else None
    assert email_service.EmailService._send_with_retry(message) is True
    assert len(smtp.attempts) == 2


# --- Retry failed -------------------------------------------------------------------


@pytest.fixture()
def started(monkeypatch):
    calls = []
    monkeypatch.setattr(email_campaign_service, "start_campaign_send", lambda cid: calls.append(cid) or True)
    return calls


def test_retry_requeues_only_failures_that_can_be_retried(client, db, admin, make_users, smtp, clock, started):
    users = make_users(7)
    outcomes = [
        ("sent", None),
        ("failed", "smtp_throttled"),
        ("failed", "smtp_rejected"),
        ("failed", "smtp_send_failed"),      # failed before Retry existed; already re-sent by hand
        ("failed", "recipient_rejected"),
        ("failed", "interrupted"),
        ("skipped", "unsubscribed"),
    ]
    campaign_id = _make_campaign(db, users, status="completed_with_errors", outcomes=outcomes)
    headers = admin.auth_headers(client)

    shown = client.get(f"{CAMPAIGNS}/{campaign_id}", params={"include_recipients": True}, headers=headers).json()
    assert [r["retryable"] for r in shown["recipients"]] == [False, True, True, False, False, False, False]

    response = client.post(f"{CAMPAIGNS}/{campaign_id}/retry", headers=headers)
    assert response.status_code == 202, response.text
    assert started == [campaign_id]

    rows = _recipients(db, campaign_id)
    assert [rows[u.email].status for u in users] == [
        "sent", "pending", "pending", "failed", "failed", "failed", "skipped",
    ]
    campaign = _campaign(db, campaign_id)
    assert (campaign.status, campaign.sent_count, campaign.failed_count, campaign.skipped_count) == ("pending", 1, 3, 1)
    assert campaign.completed_at is None
    audit = db.query(AdminAuditLog).filter(AdminAuditLog.action == "email_campaign_retried").one()
    assert audit.details == {"retried_count": 2}

    # A second click while it is queued is refused.
    assert client.post(f"{CAMPAIGNS}/{campaign_id}/retry", headers=headers).status_code == 409

    # The job sends to the two re-queued recipients only.
    email_campaign_service._run_campaign_send(campaign_id)
    assert sorted(smtp.sent) == sorted([users[1].email, users[2].email])
    campaign = _campaign(db, campaign_id)
    assert (campaign.status, campaign.sent_count, campaign.failed_count) == ("completed_with_errors", 3, 3)


def test_retry_with_nothing_retryable_changes_nothing(client, db, admin, make_users, started):
    # A campaign from before Retry existed: its failures were already handled by hand.
    users = make_users(3)
    campaign_id = _make_campaign(db, users, status="completed_with_errors", outcomes=[
        ("sent", None), ("failed", "smtp_send_failed"), ("failed", "recipient_rejected"),
    ])

    response = client.post(f"{CAMPAIGNS}/{campaign_id}/retry", headers=admin.auth_headers(client))

    assert response.status_code == 400
    assert started == []
    assert _campaign(db, campaign_id).status == "completed_with_errors"
    assert [row.status for row in _recipients(db, campaign_id).values()] == ["sent", "failed", "failed"]


def test_retry_is_refused_while_a_campaign_is_unfinished_or_another_is_sending(client, db, admin, make_users, started):
    headers = admin.auth_headers(client)
    users = make_users(2)

    stalled = _make_campaign(
        db, users[:1], status="sending", updated_at=datetime.utcnow() - timedelta(minutes=30)
    )
    response = client.post(f"{CAMPAIGNS}/{stalled}/retry", headers=headers)
    assert response.status_code == 409
    assert "Resume" in response.json()["detail"]

    finished = _make_campaign(db, users[1:], status="completed_with_errors", outcomes=[("failed", "smtp_throttled")])
    _make_campaign(db, users[:1], status="sending")  # live
    assert client.post(f"{CAMPAIGNS}/{finished}/retry", headers=headers).status_code == 409
    assert started == []

    assert client.post(f"{CAMPAIGNS}/{uuid.uuid4()}/retry", headers=headers).status_code == 404


def test_only_admins_can_retry(client, db, alice, make_users, started):
    users = make_users(1)
    campaign_id = _make_campaign(db, users, status="failed", outcomes=[("failed", "smtp_throttled")])
    response = client.post(f"{CAMPAIGNS}/{campaign_id}/retry", headers=alice.auth_headers(client))
    assert response.status_code == 403
    assert started == []
