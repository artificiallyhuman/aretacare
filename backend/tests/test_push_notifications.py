"""Push notifications: delivery runs on one event loop, and the digest push fires once.

Nothing here reaches APNs: aioapns's client is replaced by a fake that records what it
was asked to send.
"""

import asyncio
import time
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import aioapns

from app.core.config import settings
from app.models import SessionCollaborator
from app.models.daily_plan import DailyPlan
from app.models.device_token import DeviceToken
from app.services.daily_plan_service import DailyPlanService
from app.services.push_notification_service import PushNotificationService


class _FakeAPNs:
    """Behaves like aioapns.APNs where it matters: bound to the loop it was created on."""

    def __init__(self, **_kwargs):
        # aioapns's connection pool does exactly this in its constructor.
        self.loop = asyncio.get_event_loop()
        self.sent = []

    async def send_notification(self, request):
        if asyncio.get_running_loop() is not self.loop or self.loop.is_closed():
            raise RuntimeError("Event loop is closed")
        self.sent.append(request.device_token)
        return SimpleNamespace(is_successful=True, description=None)


def _enable_fake_push(monkeypatch):
    monkeypatch.setattr(settings, "PUSH_NOTIFICATIONS_ENABLED", True)
    monkeypatch.setattr(settings, "APNS_KEY_ID", "TESTKEYID0")
    monkeypatch.setattr(settings, "APNS_TEAM_ID", "TESTTEAM00")
    monkeypatch.setattr(PushNotificationService, "_resolve_key", classmethod(lambda cls: "test-key"))
    monkeypatch.setattr(aioapns, "APNs", _FakeAPNs)
    monkeypatch.setattr(PushNotificationService, "_client", None)


def _wait_for(condition, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.02)
    return False


def test_every_push_reuses_the_clients_event_loop(monkeypatch, db, alice, bob):
    """Each send used to run on a fresh loop that was then closed. The client keeps the
    loop it was created on, so every send after the first on an instance failed."""
    _enable_fake_push(monkeypatch)
    db.add(DeviceToken(user_id=bob.user_id, token=f"device{uuid.uuid4().hex}"))
    db.commit()

    for _ in range(3):
        PushNotificationService.notify_new_message(
            session_id=alice.session_id,
            session_name="alice care",
            sender_user_id=alice.user_id,
            collaborator_user_ids=[alice.user_id, bob.user_id],
        )

    assert _wait_for(lambda: PushNotificationService._client is not None)
    client = PushNotificationService._client
    assert _wait_for(lambda: len(client.sent) == 3), client.sent


def test_digest_push_only_when_the_digest_is_new(monkeypatch, client, db, alice, bob):
    """Clients call /generate whenever /check (server UTC date) says a digest is due, which
    in US evenings is a day that already has one. Returning it must not notify again."""
    db.add(SessionCollaborator(session_id=alice.session_id, user_id=bob.user_id))
    today = datetime.utcnow().date()
    db.add(DailyPlan(session_id=alice.session_id, date=today, content="Existing digest"))
    db.commit()

    pushes = []
    monkeypatch.setattr(
        PushNotificationService, "notify_daily_digest",
        classmethod(lambda cls, **kwargs: pushes.append(kwargs)),
    )
    headers = alice.auth_headers(client)

    response = client.post(
        f"/api/daily-plans/{alice.session_id}/generate",
        params={"user_date": today.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["content"] == "Existing digest"
    assert pushes == []

    async def _context(_db, _session_id):
        return {}

    async def _content(_context, user_id=None):
        return "New synthetic digest"

    monkeypatch.setattr(DailyPlanService, "_gather_context", staticmethod(_context))
    monkeypatch.setattr(DailyPlanService, "_has_sufficient_data", staticmethod(lambda _c: True))
    monkeypatch.setattr(DailyPlanService, "_generate_plan_content", staticmethod(_content))

    yesterday = today - timedelta(days=1)
    response = client.post(
        f"/api/daily-plans/{alice.session_id}/generate",
        params={"user_date": yesterday.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["content"] == "New synthetic digest"
    assert len(pushes) == 1
    assert bob.user_id in pushes[0]["user_ids"]
    assert pushes[0]["exclude_user_id"] == alice.user_id
