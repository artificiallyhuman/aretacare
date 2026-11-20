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
    monkeypatch.setattr(settings, "WEB_SEARCH_ENABLED", True)
    fake = fake_openai(lambda _kwargs, _i: _reply("Plain answer."))
    captured = _capture_synthesis(monkeypatch)

    response = client.post(
        "/api/conversation/message", headers=alice.auth_headers(client),
        json={"content": "What did I write about the pharmacy back then?", "session_id": alice.session_id},
    )

    assert response.status_code == 200, response.text
    assert len(fake.calls) == 1
    # No lookups: the only tool left is the trusted-source search (see test_web_search.py).
    assert fake.calls[0]["tools"] == [service_module.trusted_web_search_tool()]
    assert "include" not in fake.calls[0]
    assert not any(m.get("content") == ai_config.CHAT_LOOKUP_INSTRUCTIONS
                   for m in fake.calls[0]["input"] if isinstance(m, dict))
    assert captured["restated_records"] is False


def test_chat_route_with_lookups_and_search_both_switched_off(client, alice, fake_openai, monkeypatch):
    monkeypatch.setattr(settings, "CHAT_TOOLS_ENABLED", False)
    monkeypatch.setattr(settings, "WEB_SEARCH_ENABLED", False)
    fake = fake_openai(lambda _kwargs, _i: _reply("Plain answer."))
    _capture_synthesis(monkeypatch)

    response = client.post(
        "/api/conversation/message", headers=alice.auth_headers(client),
        json={"content": "What did I write about the pharmacy back then?", "session_id": alice.session_id},
    )

    assert response.status_code == 200, response.text
    assert len(fake.calls) == 1
    assert "tools" not in fake.calls[0] and "include" not in fake.calls[0]
    assert not any(m.get("content") == ai_config.WEB_SEARCH_INSTRUCTIONS
                   for m in fake.calls[0]["input"] if isinstance(m, dict))


# --- searching a date range --------------------------------------------------

def test_a_date_range_is_searched_not_filtered_afterwards(db, alice, monkeypatch):
    """The best matches overall were taken first and then filtered by date, so an older
    entry was reported missing whenever newer ones matched too."""
    for n in range(10):
        db.add(_entry(alice.session_id, alice.user_id, n + 1, f"Refill {n}", "Picked up refills at the pharmacy."))
    db.add(_entry(alice.session_id, alice.user_id, 90, "Pharmacy change", "Prescriptions moved to Example Pharmacy."))
    db.commit()
    seen = {}

    async def similar(self, **kwargs):
        seen.update(kwargs)
        return []

    monkeypatch.setattr("app.services.embedding_service.EmbeddingService.find_similar_entries", similar)
    day = date.today() - timedelta(days=90)
    start, end = day - timedelta(days=5), day + timedelta(days=5)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    output = asyncio.run(runner.run("search_journal", json.dumps(
        {"query": "pharmacy", "start_date": start.isoformat(), "end_date": end.isoformat()})))

    assert "Example Pharmacy" in output and "Refill" not in output
    assert (seen["start_date"], seen["end_date"]) == (start, end)


def test_semantic_search_applies_the_date_range_before_its_limit(db, alice, bob, monkeypatch):
    from app.models.journal_entry_embedding import JournalEntryEmbedding
    from app.services.embedding_service import EmbeddingService

    exact = [1.0] + [0.0] * 1535
    near = [0.9, 0.1] + [0.0] * 1534

    def embedded(account, days_ago, title, vector):
        entry = _entry(account.session_id, account.user_id, days_ago, title, "text")
        db.add(entry)
        db.flush()
        db.add(JournalEntryEmbedding(journal_entry_id=entry.id, session_id=account.session_id,
                                     embedding=vector, content_hash="x"))
        return entry

    recent = [embedded(alice, n, f"recent {n}", exact) for n in (1, 2, 3)]
    old = embedded(alice, 60, "old", near)
    embedded(bob, 60, "bob old", exact)  # another care session, same period
    db.commit()

    async def fixed_vector(self, _text):
        return exact

    monkeypatch.setattr(EmbeddingService, "generate_embedding_fast", fixed_vector)
    service = EmbeddingService(db)
    day = date.today() - timedelta(days=60)

    def titles(**kwargs):
        found = asyncio.run(service.find_similar_entries(
            session_id=alice.session_id, query_text="what happened back then?", top_k=2, min_days_old=-1, **kwargs))
        return [entry.title for entry, _score in found]

    assert set(titles()) <= {e.title for e in recent}
    assert titles(start_date=day - timedelta(days=3), end_date=day + timedelta(days=3)) == ["old"]
    assert titles(start_date=day - timedelta(days=3)) != ["old"]  # open-ended: newer ones rank first
    assert titles(end_date=day, exclude_entry_ids=[old.id]) == []


# --- the clock -----------------------------------------------------------------

class _Clock:
    """Stands in for the time module inside openai_service: monotonic() only moves when a
    test moves it."""

    def __init__(self):
        import time as real_time
        self.now = 1000.0
        self.time = real_time.time

    def monotonic(self):
        return self.now


@pytest.fixture()
def clock(monkeypatch):
    fake = _Clock()
    monkeypatch.setattr(service_module, "time", fake)
    return fake


def test_lookups_returned_after_the_deadline_are_not_run(db, alice, fake_openai, clock):
    def respond(kwargs, i):
        if i == 0:
            clock.now += ai_config.CHAT_LOOKUP_DEADLINE_SECONDS + 5  # a slow first request
            return _lookup(_call("get_daily_digest", {}))
        return _reply("Answered with what I had.")

    fake = fake_openai(respond)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert _complete(runner) == "Answered with what I had."
    assert runner.calls == []
    assert fake.calls[1]["tool_choice"] == "none"
    assert "run out" in _outputs(fake.calls[1])["call_1"]


def test_each_request_gets_only_the_time_left(db, alice, fake_openai, clock):
    def respond(kwargs, i):
        clock.now += 10
        if kwargs.get("tool_choice") == "none":
            return _reply("Done.")
        return _lookup(_call("list_documents", {}, f"c{i}"))

    fake = fake_openai(respond)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert _complete(runner) == "Done."
    timeouts = [c["timeout"] for c in fake.calls]
    reply, reserve = ai_config.CHAT_REPLY_DEADLINE_SECONDS, ai_config.CHAT_REPLY_RESERVE_SECONDS
    # The first request is also the plain reply: the normal timeout. Later lookup rounds
    # leave the reserve for the closing reply, which gets whatever is left.
    assert timeouts[0] == settings.OPENAI_TIMEOUT_SECONDS
    assert timeouts[1] == reply - reserve - 10 and timeouts[2] == reply - reserve - 20
    assert fake.calls[-1]["tool_choice"] == "none" and timeouts[-1] == reply - 10 * (len(fake.calls) - 1)
    assert all(t <= settings.OPENAI_TIMEOUT_SECONDS for t in timeouts)


def test_a_lookup_round_that_runs_out_of_time_still_answers(db, alice, fake_openai, clock, monkeypatch):
    from openai import APITimeoutError

    breaker_failures = []
    monkeypatch.setattr(service_module.openai_circuit_breaker, "record_failure",
                        lambda: breaker_failures.append(1))

    def respond(kwargs, i):
        if kwargs.get("tool_choice") == "none":
            return _reply("Here is what I found so far.")
        if i == 0:
            return _lookup(_call("get_daily_digest", {}))
        clock.now += kwargs["timeout"]  # the round used its whole share and timed out
        raise APITimeoutError(request=httpx.Request("POST", "https://api.openai.test/v1/responses"))

    fake = fake_openai(respond)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert _complete(runner) == "Here is what I found so far."
    assert len(fake.calls) == 3  # no retry of the timed-out round: no time for one
    assert fake.calls[2]["timeout"] == ai_config.CHAT_REPLY_RESERVE_SECONDS
    # A timeout we shortened says nothing about OpenAI's health.
    assert breaker_failures == []


def test_a_request_is_cut_off_when_its_time_runs_out(clock, fake_openai, monkeypatch):
    """httpx's timeout limits each network step, not the whole request; the deadline is
    enforced around the request itself."""
    import time as real_time

    breaker_failures = []
    monkeypatch.setattr(service_module, "MIN_REQUEST_SECONDS", 0.05)
    monkeypatch.setattr(service_module.openai_circuit_breaker, "record_failure",
                        lambda: breaker_failures.append(1))

    class SlowResponses:
        async def create(self, **_kwargs):
            await asyncio.sleep(5)  # the server trickles: no single step times out
            return _reply("too late")

    monkeypatch.setattr(service_module.openai_service, "client", SimpleNamespace(responses=SlowResponses()))
    started = real_time.perf_counter()
    response = asyncio.run(service_module.openai_service._request_with_retries(
        {"input": [], "store": False}, "conversation", None, deadline=clock.now + 0.3,
    ))
    assert response is None
    assert real_time.perf_counter() - started < 2
    assert breaker_failures == []  # our own limit, not OpenAI's health


def test_a_slow_lookup_is_cut_off_and_the_reply_still_written(db, alice, fake_openai, clock, monkeypatch):
    import time as real_time

    # 0.3 s of lookup time before the closing reply's reserve.
    monkeypatch.setattr(ai_config, "CHAT_REPLY_DEADLINE_SECONDS", ai_config.CHAT_REPLY_RESERVE_SECONDS + 0.3)

    async def slow_search(self, **_kwargs):
        await asyncio.sleep(5)
        return []

    monkeypatch.setattr("app.services.embedding_service.EmbeddingService.find_similar_entries", slow_search)

    def respond(kwargs, i):
        if kwargs.get("tool_choice") == "none":
            return _reply("Answered with what I had.")
        return _lookup(_call("search_journal", {"query": "what did the cardiologist say"}))

    fake = fake_openai(respond)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)
    started = real_time.perf_counter()

    assert _complete(runner) == "Answered with what I had."
    assert real_time.perf_counter() - started < 2
    assert runner.calls == []
    assert "took too long" in _outputs(fake.calls[-1])["call_1"]
    assert fake.calls[-1]["tool_choice"] == "none"


# --- staying inside the edge proxy's timeout ----------------------------------

def test_a_slow_journal_synthesis_does_not_hold_up_the_reply(client, alice, fake_openai, monkeypatch):
    """Synthesis (and the embeddings after it) had no time limit, so a slow turn could pass
    Cloudflare's ~100 s and return a 524 for a reply that was already saved."""
    import time as time_module

    from app.api import conversation as conversation_api

    monkeypatch.setattr(settings, "CHAT_TOOLS_ENABLED", False)
    monkeypatch.setattr(conversation_api, "TURN_RESPONSE_BUDGET_SECONDS", 0)
    fake_openai(lambda _kwargs, _i: _reply("Plain answer."))
    started = []

    async def slow_synthesize(self, **kwargs):
        started.append(True)
        await asyncio.sleep(5)
        return JournalSynthesisResult(should_create=False, reasoning="slow", suggested_entries=[])

    monkeypatch.setattr("app.services.journal_service.JournalService.assess_and_synthesize", slow_synthesize)
    began = time_module.monotonic()
    response = client.post(
        "/api/conversation/message", headers=alice.auth_headers(client),
        json={"content": "How was the appointment today?", "session_id": alice.session_id},
    )
    assert response.status_code == 200, response.text
    assert response.json()["message"]["content"] == "Plain answer."
    assert response.json()["journal_suggestion"] is None
    assert started and time_module.monotonic() - began < 4


def test_a_reply_past_its_deadline_starts_no_request(fake_openai):
    fake = fake_openai(lambda _kwargs, _i: _reply("Too late."))
    import time as time_module

    result = asyncio.run(service_module.openai_service._create_chat_completion(
        [{"role": "user", "content": "Hello"}], feature="conversation",
        reply_deadline=time_module.monotonic() - 1,
    ))
    assert result is None and fake.calls == []


def test_the_text_fallback_shares_the_replys_time_budget(monkeypatch):
    """The PDF text fallback used to start a fresh 75 s budget after a slow first attempt."""
    deadlines = []

    async def no_reply(self, messages, feature="unknown", user_id=None, max_output_tokens=None,
                       tool_runner=None, reply_deadline=None, web_search=False):
        deadlines.append(reply_deadline)
        return None

    monkeypatch.setattr(type(service_module.openai_service), "_create_chat_completion", no_reply)
    reply = asyncio.run(service_module.openai_service.chat_with_journal(
        message="What does this say?", conversation_history=[],
        document_url="https://files.example/doc.pdf", document_type="document",
        content_type="application/pdf", extracted_text="Potassium 4.1",
    ))
    assert reply == ai_config.FALLBACK_CHAT
    assert len(deadlines) == 2 and deadlines[0] is not None and deadlines[0] == deadlines[1]


def test_document_categorization_past_its_deadline_falls_back(fake_openai):
    import time as time_module

    fake = fake_openai(lambda _kwargs, _i: _reply('{"category": "lab_result", "description": "Labs"}'))
    result = asyncio.run(service_module.openai_service.categorize_document(
        filename="scan.pdf", content_type="application/pdf", document_url="https://files.example/scan.pdf",
        extracted_text="Potassium 4.1", deadline=time_module.monotonic() - 1,
    ))
    assert result["category"] == ai_config.FALLBACK_DOCUMENT_CATEGORY and fake.calls == []
