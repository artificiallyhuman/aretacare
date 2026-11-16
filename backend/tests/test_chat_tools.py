"""Chat's read-only lookups (services/chat_tools.py and the loop in openai_service).

No network: the OpenAI client is a scripted fake, and the embedding search is stubbed
(the backend container's environment may carry a real API key).
"""
import asyncio
import importlib
import json
from datetime import date, timedelta
from types import SimpleNamespace

import httpx
import pytest
from openai import BadRequestError

from app.config import ai_config
from app.core.config import settings
from app.models import Conversation, JournalEntry
from app.models.conversation import MessageRole
from app.models.journal import EntryType
from app.schemas.journal import JournalSynthesisResult
from app.services.chat_tools import CHAT_TOOL_NAMES, REFUSED, ChatToolRunner

service_module = importlib.import_module("app.services.openai_service")


def _call(name, args, call_id="call_1"):
    return SimpleNamespace(type="function_call", name=name, arguments=json.dumps(args), call_id=call_id)


def _lookup(*calls):
    return SimpleNamespace(
        output_text="", usage=None,
        output=[SimpleNamespace(type="reasoning", encrypted_content="opaque"), *calls],
    )


def _reply(text):
    return SimpleNamespace(output_text=text, usage=None, output=[SimpleNamespace(type="message")])


class _Responses:
    """Answers each request with `respond(kwargs, index)`, keeping a snapshot of it
    (the loop extends one input list across rounds)."""

    def __init__(self, respond):
        self.respond = respond
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append({**kwargs, "input": list(kwargs["input"])})
        return self.respond(kwargs, len(self.calls) - 1)


@pytest.fixture()
def fake_openai(monkeypatch):
    async def no_log(**_):
        return None

    async def no_similar(self, **_):
        return []

    monkeypatch.setattr(service_module, "log_api_call", no_log)
    monkeypatch.setattr("app.services.error_logger.log_error_standalone", lambda **_: None)
    monkeypatch.setattr("app.services.embedding_service.EmbeddingService.find_similar_entries", no_similar)

    def install(respond):
        responses = _Responses(respond)
        monkeypatch.setattr(service_module.openai_service, "client", SimpleNamespace(responses=responses))
        return responses

    return install


def _entry(session_id, user_id, days_ago, title, content):
    return JournalEntry(
        session_id=session_id, entry_date=date.today() - timedelta(days=days_ago),
        entry_type=EntryType.OTHER, title=title, content=content, created_by=user_id,
    )


def _outputs(request):
    return {i["call_id"]: i["output"] for i in request["input"]
            if isinstance(i, dict) and i.get("type") == "function_call_output"}


def _complete(runner, text="What did I note about the pharmacy?"):
    return asyncio.run(service_module.openai_service._create_chat_completion(
        [{"role": "user", "content": text}], feature="conversation", tool_runner=runner,
    ))


def test_chat_looks_up_records_only_in_its_own_care_session(db, alice, bob, fake_openai):
    day = (date.today() - timedelta(days=45)).isoformat()
    db.add_all([
        _entry(alice.session_id, alice.user_id, 45, "Pharmacy change", "Prescriptions moved to Example Pharmacy."),
        _entry(bob.session_id, bob.user_id, 45, "Bob only", "bob private note"),
    ])
    db.commit()
    script = [
        # A session id smuggled into the arguments changes nothing: the route decides.
        _lookup(_call("get_journal_entries", {"start_date": day, "session_id": bob.session_id})),
        _reply("You moved prescriptions to Example Pharmacy. ![x](https://evil.example/p.png)"),
    ]
    fake = fake_openai(lambda _kwargs, i: script[i])
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    text = _complete(runner)

    assert "Example Pharmacy" in text and "evil.example" not in text
    assert len(fake.calls) == 2
    for request in fake.calls:
        assert request["store"] is False
        assert request["include"] == ["reasoning.encrypted_content"]
        assert {t["name"] for t in request["tools"]} == set(CHAT_TOOL_NAMES)
    # Round 2 carries the model's own output items, then the lookup result.
    second = fake.calls[1]["input"]
    assert any(getattr(i, "type", None) == "reasoning" for i in second)
    output = _outputs(fake.calls[1])["call_1"]
    assert "Example Pharmacy" in output and "bob private note" not in output
    assert "<untrusted_content" in output
    assert runner.calls == ["get_journal_entries"]


def test_chat_lookups_refuse_everything_but_the_read_tools(db, alice):
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    async def attempts():
        return [
            await runner.run("propose_journal_entry", json.dumps(
                {"title": "x", "content": "y", "entry_type": "OTHER"})),
            await runner.run("confirm_action", json.dumps({"action_id": "a"})),
            await runner.run("suggest_profile_change", json.dumps(
                {"section": "allergies", "change_type": "add", "reasoning": "r"})),
            await runner.run("get_recent_chat", "{}"),
            await runner.run("no_such_tool", "{}"),
        ]

    assert asyncio.run(attempts()) == [REFUSED] * 5
    assert asyncio.run(runner.run("get_daily_digest", "{not json")) == "The tool arguments were not valid JSON."
    assert runner.calls == []
    assert db.query(JournalEntry).filter(JournalEntry.session_id == alice.session_id).count() == 0


def test_chat_lookups_stop_at_the_round_limit(db, alice, fake_openai):
    def respond(kwargs, i):
        if kwargs.get("tool_choice") == "none":
            return _reply("Here is what I found.")
        return _lookup(_call("get_daily_digest", {}, f"a{i}"), _call("list_documents", {}, f"b{i}"))

    fake = fake_openai(respond)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert _complete(runner) == "Here is what I found."
    rounds = ai_config.CHAT_MAX_LOOKUP_ROUNDS
    assert len(fake.calls) == rounds + 1
    assert [c.get("tool_choice") for c in fake.calls] == [None] * rounds + ["none"]
    assert len(runner.calls) == 2 * rounds


def test_chat_lookups_stop_at_the_call_limit(db, alice, fake_openai, monkeypatch):
    monkeypatch.setattr(ai_config, "CHAT_MAX_LOOKUP_CALLS", 3)

    def respond(kwargs, i):
        if kwargs.get("tool_choice") == "none":
            return _reply("Done.")
        return _lookup(_call("get_daily_digest", {}, f"a{i}"), _call("list_documents", {}, f"b{i}"))

    fake = fake_openai(respond)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert _complete(runner) == "Done."
    assert len(runner.calls) == 3
    assert len(fake.calls) == 3 and fake.calls[-1]["tool_choice"] == "none"
    assert "lookup limit" in _outputs(fake.calls[-1])["b1"]


def test_chat_lookups_stop_at_the_deadline(db, alice, fake_openai, monkeypatch):
    monkeypatch.setattr(ai_config, "CHAT_LOOKUP_DEADLINE_SECONDS", 0)
    fake = fake_openai(lambda _kwargs, _i: _reply("Answered from context."))
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert _complete(runner) == "Answered from context."
    assert len(fake.calls) == 1 and fake.calls[0]["tool_choice"] == "none"


def test_rejected_lookup_request_is_answered_without_lookups(db, alice, fake_openai):
    rejected = BadRequestError(
        "Unsupported parameter",
        response=httpx.Response(400, request=httpx.Request("POST", "https://api.openai.test/v1/responses")),
        body=None,
    )

    def respond(kwargs, _i):
        if "tools" in kwargs:
            raise rejected
        return _reply("Plain answer.")

    fake = fake_openai(respond)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert _complete(runner) == "Plain answer."
    assert "tools" in fake.calls[0] and "tools" not in fake.calls[1]
    assert fake.calls[1]["store"] is False


def _capture_synthesis(monkeypatch):
    captured = {}

    async def fake_synthesize(self, **kwargs):
        captured.update(kwargs)
        return JournalSynthesisResult(should_create=False, reasoning="test", suggested_entries=[])

    monkeypatch.setattr("app.services.journal_service.JournalService.assess_and_synthesize", fake_synthesize)
    return captured


def test_chat_route_finds_an_old_entry_and_tells_synthesis(client, db, alice, fake_openai, monkeypatch):
    monkeypatch.setattr(settings, "CHAT_TOOLS_ENABLED", True)
    day = (date.today() - timedelta(days=45)).isoformat()
    db.add(_entry(alice.session_id, alice.user_id, 45, "Pharmacy change", "Prescriptions moved to Example Pharmacy."))
    db.commit()
    script = [_lookup(_call("get_journal_entries", {"start_date": day})),
              _reply("On that day you noted the move to Example Pharmacy.")]
    fake = fake_openai(lambda _kwargs, i: script[i])
    captured = _capture_synthesis(monkeypatch)

    response = client.post(
        "/api/conversation/message", headers=alice.auth_headers(client),
        json={"content": "What did I write about the pharmacy back then?", "session_id": alice.session_id},
    )

    assert response.status_code == 200, response.text
    assert "Example Pharmacy" in response.json()["message"]["content"]
    assert "Example Pharmacy" in _outputs(fake.calls[1])["call_1"]
    assert any(m.get("content") == ai_config.CHAT_LOOKUP_INSTRUCTIONS
               for m in fake.calls[0]["input"] if isinstance(m, dict))
    assert captured["restated_records"] is True
    db.expire_all()
    saved = db.query(Conversation).filter(
        Conversation.session_id == alice.session_id, Conversation.role == MessageRole.ASSISTANT,
    ).one()
    assert "Example Pharmacy" in saved.content


def test_chat_route_without_lookups_when_switched_off(client, alice, fake_openai, monkeypatch):
    monkeypatch.setattr(settings, "CHAT_TOOLS_ENABLED", False)
    fake = fake_openai(lambda _kwargs, _i: _reply("Plain answer."))
    captured = _capture_synthesis(monkeypatch)

    response = client.post(
        "/api/conversation/message", headers=alice.auth_headers(client),
        json={"content": "What did I write about the pharmacy back then?", "session_id": alice.session_id},
    )

    assert response.status_code == 200, response.text
    assert len(fake.calls) == 1
    assert "tools" not in fake.calls[0] and "include" not in fake.calls[0]
    assert not any(m.get("content") == ai_config.CHAT_LOOKUP_INSTRUCTIONS
                   for m in fake.calls[0]["input"] if isinstance(m, dict))
    assert captured["restated_records"] is False
