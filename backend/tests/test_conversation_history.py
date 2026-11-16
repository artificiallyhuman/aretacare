"""Conversation history: what the clients need to render each message."""

from app.models import Conversation, Document
from app.models.conversation import MessageRole, MessageType


def test_document_message_carries_the_file_name_not_the_users_text(client, db, alice):
    # The app labelled an attached file with the text typed alongside it, because the
    # history had no file name to show. It must come from the document itself.
    document = Document(
        session_id=alice.session_id,
        filename="example-visit-summary.pdf",
        s3_key="test/documents/does-not-exist.pdf",
        content_type="application/pdf",
        uploaded_by_user_id=alice.user_id,
    )
    db.add(document)
    db.flush()
    db.add(Conversation(
        session_id=alice.session_id,
        role=MessageRole.USER,
        content="Can you summarize this for me?",
        message_type=MessageType.DOCUMENT,
        document_id=document.id,
        created_by_user_id=alice.user_id,
    ))
    db.add(Conversation(
        session_id=alice.session_id,
        role=MessageRole.USER,
        content="A plain message",
        message_type=MessageType.TEXT,
        created_by_user_id=alice.user_id,
    ))
    db.commit()

    response = client.get(
        f"/api/conversation/{alice.session_id}/history",
        headers=alice.auth_headers(client),
    )
    assert response.status_code == 200
    by_content = {m["content"]: m for m in response.json()["messages"]}
    assert by_content["Can you summarize this for me?"]["document_filename"] == "example-visit-summary.pdf"
    assert by_content["A plain message"]["document_filename"] is None
