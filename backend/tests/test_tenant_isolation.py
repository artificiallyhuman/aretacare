"""One user must not be able to reach another user's care session or anything in it."""

import pytest

from app.models.document import Document

# Refused outright or reported as absent — both keep the data private. What must never
# happen is a 200.
DENIED = (403, 404)


@pytest.mark.parametrize("path", [
    "/api/sessions/{sid}",
    "/api/sessions/{sid}/statistics",
    "/api/journal/{sid}",
    "/api/journal/{sid}/dates",
    "/api/documents/session/{sid}",
    "/api/documents/session/{sid}/dates",
    "/api/audio-recordings/{sid}",
    "/api/conversation/{sid}/history",
    "/api/profile/{sid}",
    "/api/profile/{sid}/check",
    "/api/profile/{sid}/pending-changes",
    "/api/daily-plans/{sid}",
    "/api/daily-plans/{sid}/latest",
    "/api/daily-plans/{sid}/check",
])
def test_other_users_session_is_not_readable(client, alice, bob, path):
    url = path.format(sid=alice.session_id)

    # The owner is not refused (a session with no data yet may legitimately be 404 on
    # some routes, so only the access decision is asserted)...
    assert client.get(url, headers=alice.auth_headers(client)).status_code != 403
    # ...and someone else is.
    assert client.get(url, headers=bob.auth_headers(client)).status_code in DENIED


def test_session_list_only_contains_own_sessions(client, alice, bob):
    listed = client.get("/api/sessions/", headers=bob.auth_headers(client))
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json()}
    assert bob.session_id in ids
    assert alice.session_id not in ids


@pytest.fixture()
def alice_document(db, alice):
    document = Document(
        session_id=alice.session_id,
        filename="example-note.txt",
        s3_key="test/documents/does-not-exist.txt",
        content_type="text/plain",
        extracted_text="placeholder text",
        uploaded_by_user_id=alice.user_id,
    )
    db.add(document)
    db.commit()
    return document.id


@pytest.mark.parametrize("path", [
    "/api/documents/{doc}",
    "/api/documents/{doc}/download-url",
    "/api/documents/{doc}/thumbnail-url",
])
def test_other_users_document_is_not_readable_by_id(client, bob, alice_document, path):
    response = client.get(path.format(doc=alice_document), headers=bob.auth_headers(client))
    assert response.status_code in DENIED


def test_message_cannot_attach_a_document_from_another_session(client, bob, alice_document):
    # The caller is allowed to post to their own session; the document id in the body
    # belongs to someone else's. It has to be looked up within the caller's session, so
    # it is simply not found — and the request stops before any AI processing.
    response = client.post(
        "/api/conversation/message",
        headers=bob.auth_headers(client),
        json={
            "content": "Please summarise the attached document.",
            "session_id": bob.session_id,
            "message_type": "document",
            "document_id": alice_document,
        },
    )
    assert response.status_code == 404


def test_message_cannot_be_posted_to_another_users_session(client, alice, bob):
    response = client.post(
        "/api/conversation/message",
        headers=bob.auth_headers(client),
        json={"content": "Hello", "session_id": alice.session_id},
    )
    assert response.status_code in DENIED
