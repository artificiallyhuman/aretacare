"""The in-app notice: the second electronic channel for breach notifications."""
import pytest

from app.models import AdminAuditLog, AppNotice

NOTICE = "/api/notice"
ADMIN_NOTICES = "/api/admin/notices"


@pytest.fixture()
def admin(make_account, monkeypatch):
    """A verified user whose email is on the admin list for the length of the test."""
    from app.core.config import settings

    account = make_account("admin")
    monkeypatch.setattr(settings, "ADMIN_EMAILS", account.email)
    return account


@pytest.fixture(autouse=True)
def _no_notices_left_behind(db):
    yield
    db.rollback()
    db.query(AppNotice).delete(synchronize_session=False)
    db.query(AdminAuditLog).filter(AdminAuditLog.target_type == "app_notice").delete(synchronize_session=False)
    db.commit()


def _publish(client, headers, **overrides):
    payload = {"title": "Security notice", "body": "On 1 May we found a problem.\nHere is what happened."}
    payload.update(overrides)
    return client.post(ADMIN_NOTICES, json=payload, headers=headers)


def test_signed_out_requests_are_refused(client):
    assert client.get(NOTICE).status_code == 401


def test_only_admins_can_publish_or_list(client, alice):
    headers = alice.auth_headers(client)
    assert client.get(ADMIN_NOTICES, headers=headers).status_code == 403
    assert _publish(client, headers).status_code == 403
    assert client.get(NOTICE, headers=headers).json() == {"notice": None}


def test_a_published_notice_reaches_every_user_and_a_new_one_replaces_it(client, db, admin, alice):
    admin_headers = admin.auth_headers(client)
    user_headers = alice.auth_headers(client)

    first = _publish(client, admin_headers)
    assert first.status_code == 201, first.text
    shown = client.get(NOTICE, headers=user_headers).json()["notice"]
    assert shown["id"] == first.json()["id"]
    assert shown["body"] == "On 1 May we found a problem.\nHere is what happened."
    assert shown["link_url"] is None and shown["link_label"] is None
    assert "created_by_email" not in shown  # users don't see which admin published it

    second = _publish(client, admin_headers, title="Update", link_url="https://aretacare.com/security-incident")
    assert second.status_code == 201, second.text
    assert second.json()["link_label"] == "Learn more"
    assert client.get(NOTICE, headers=user_headers).json()["notice"]["id"] == second.json()["id"]

    history = client.get(ADMIN_NOTICES, headers=admin_headers).json()["notices"]
    assert [n["id"] for n in history] == [second.json()["id"], first.json()["id"]]
    assert history[1]["is_active"] is False
    assert history[1]["ended_by_email"] == admin.email
    assert history[0]["created_by_email"] == admin.email

    actions = {
        row.action for row in db.query(AdminAuditLog).filter(AdminAuditLog.target_type == "app_notice")
    }
    assert actions == {"app_notice_published"}


def test_ending_a_notice_hides_it_and_keeps_the_record(client, admin, alice):
    admin_headers = admin.auth_headers(client)
    notice_id = _publish(client, admin_headers).json()["id"]

    ended = client.post(f"{ADMIN_NOTICES}/{notice_id}/end", headers=admin_headers)
    assert ended.status_code == 200, ended.text
    assert ended.json()["is_active"] is False and ended.json()["ended_at"]
    assert client.get(NOTICE, headers=alice.auth_headers(client)).json() == {"notice": None}
    assert client.post(f"{ADMIN_NOTICES}/{notice_id}/end", headers=admin_headers).status_code == 409
    assert client.post(f"{ADMIN_NOTICES}/999999999/end", headers=admin_headers).status_code == 404
    assert len(client.get(ADMIN_NOTICES, headers=admin_headers).json()["notices"]) == 1


@pytest.mark.parametrize("link", [
    "http://aretacare.com/incident",          # not https
    "https://example.com/incident",           # someone else's site
    "https://aretacare.com.example.com/x",    # lookalike host
    "https://evilaretacare.com/x",            # suffix without the dot
    "https://user@aretacare.com/x",           # credentials in the URL
    "javascript:alert(1)",
])
def test_links_must_be_https_on_aretacare(client, admin, link):
    response = _publish(client, admin.auth_headers(client), link_url=link)
    assert response.status_code == 400, response.text  # the app reports validation errors as 400
    assert "link_url" in response.json()["detail"]


def test_blank_title_or_body_is_refused_and_subdomain_links_are_allowed(client, admin):
    headers = admin.auth_headers(client)
    assert _publish(client, headers, title="   ").status_code == 400
    assert _publish(client, headers, body="").status_code == 400
    ok = _publish(client, headers, link_url="https://status.aretacare.com/incident", link_label="Details")
    assert ok.status_code == 201, ok.text
    assert ok.json()["link_label"] == "Details"
