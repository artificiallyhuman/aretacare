"""Trusted-source web search in chat, the Jargon Translator and the Conversation Coach
(openai_service.trusted_web_search_tool). Talk's search tool is covered in test_talk.py.

No network: the OpenAI client is a scripted fake.
"""
import asyncio
import importlib
import json
from types import SimpleNamespace

import httpx
import pytest
from openai import BadRequestError

from app.config import ai_config
from app.core.config import settings
from app.services.chat_tools import CHAT_TOOL_NAMES, ChatToolRunner

service_module = importlib.import_module("app.services.openai_service")


class _Responses:
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

    monkeypatch.setattr(service_module, "log_api_call", no_log)
    monkeypatch.setattr(settings, "WEB_SEARCH_ENABLED", True)

    def install(respond):
        responses = _Responses(respond)
        monkeypatch.setattr(service_module.openai_service, "client", SimpleNamespace(responses=responses))
        return responses

    return install


def _search_call():
    return SimpleNamespace(type="web_search_call", id="ws_1", status="completed")


def _reply(text, *extra):
    return SimpleNamespace(output_text=text, usage=None, output=[*extra, SimpleNamespace(type="message")])


def _rejected():
    return BadRequestError(
        "Unsupported parameter",
        response=httpx.Response(400, request=httpx.Request("POST", "https://api.openai.test/v1/responses")),
        body=None,
    )


def _web_tools(request):
    return [t for t in request.get("tools", []) if t.get("type") == "web_search"]


def _complete(**kwargs):
    return asyncio.run(service_module.openai_service._create_chat_completion(
        [{"role": "user", "content": "Is dizziness a side effect of metoprolol?"}], feature="conversation", **kwargs,
    ))


# --- the tool itself -----------------------------------------------------------

def test_search_is_restricted_to_trusted_domains_and_the_cached_index():
    tool = service_module.trusted_web_search_tool()
    assert tool["type"] == "web_search"
    assert tool["filters"]["allowed_domains"] == list(ai_config.TRUSTED_HEALTH_DOMAINS)
    # Live access would need privacy-policy changes first.
    assert tool["external_web_access"] is False
    domains = ai_config.TRUSTED_HEALTH_DOMAINS
    assert 0 < len(domains) <= 100 and len(set(domains)) == len(domains)
    assert all("://" not in d and "/" not in d and d == d.lower() for d in domains)
    # nih.gov as a whole would pull in PubMed research papers.
    assert "nih.gov" not in domains and "ncbi.nlm.nih.gov" not in domains


def test_jargon_and_coach_links_follow_the_trusted_list():
    text = (
        "[Label](https://dailymed.nlm.nih.gov/dailymed/x) "
        "[Study](https://pubmed.ncbi.nlm.nih.gov/123/) "
        "[Clinic](https://my.clevelandclinic.org/health/x) "
        "[Other](https://evil.example/x)"
    )
    filtered = service_module._filter_citation_links(text)
    assert "https://dailymed.nlm.nih.gov/dailymed/x" in filtered
    assert "https://my.clevelandclinic.org/health/x" in filtered
    assert "pubmed.ncbi" not in filtered and "evil.example" not in filtered


# --- chat ----------------------------------------------------------------------

def test_plain_chat_offers_the_search_and_falls_back_without_it(fake_openai):
    def respond(kwargs, _i):
        if "tools" in kwargs:
            raise _rejected()
        return _reply("Plain answer.")

    fake = fake_openai(respond)
    assert _complete(web_search=True) == "Plain answer."
    assert fake.calls[0]["tools"] == [service_module.trusted_web_search_tool()]
    assert fake.calls[0]["store"] is False
    assert "tools" not in fake.calls[1] and fake.calls[1]["store"] is False


def test_search_results_come_back_as_the_reply(fake_openai):
    fake = fake_openai(lambda _k, _i: _reply("MedlinePlus lists dizziness. ![x](https://evil.example/p.png)",
                                             _search_call()))
    text = _complete(web_search=True)
    assert "MedlinePlus lists dizziness." in text and "evil.example" not in text
    assert len(fake.calls) == 1


def test_search_is_offered_alongside_lookups_and_its_items_are_re_sent(db, alice, fake_openai):
    call = SimpleNamespace(type="function_call", name="get_health_profile", arguments=json.dumps({}),
                           call_id="call_1")
    script = [
        SimpleNamespace(output_text="", usage=None, output=[
            SimpleNamespace(type="reasoning", encrypted_content="opaque"), _search_call(), call,
        ]),
        _reply("Dizziness is a commonly listed side effect."),
    ]
    fake = fake_openai(lambda _k, i: script[i])
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    assert "commonly listed" in _complete(tool_runner=runner, web_search=True)
    for request in fake.calls:
        assert {t["name"] for t in request["tools"] if t.get("type") == "function"} == set(CHAT_TOOL_NAMES)
        assert _web_tools(request) == [service_module.trusted_web_search_tool()]
    assert any(getattr(i, "type", None) == "web_search_call" for i in fake.calls[1]["input"])
    assert runner.calls == ["get_health_profile"]  # the search is not a lookup


def test_kill_switch_removes_the_search(db, alice, fake_openai, monkeypatch):
    fake = fake_openai(lambda _k, _i: _reply("Answer."))
    monkeypatch.setattr(settings, "WEB_SEARCH_ENABLED", False)
    runner = ChatToolRunner(db, session_id=alice.session_id, user_id=alice.user_id)

    _complete(web_search=True)
    _complete(tool_runner=runner, web_search=True)

    assert "tools" not in fake.calls[0]
    assert _web_tools(fake.calls[1]) == [] and fake.calls[1]["tools"]


# --- Jargon Translator and Conversation Coach ------------------------------------

def _system_texts(request):
    return [m["content"] for m in request["input"] if isinstance(m, dict) and m.get("role") == "system"]


def test_tools_search_trusted_sources_and_drop_other_links(fake_openai):
    fake = fake_openai(lambda _k, _i: _reply(
        "A1C measures average blood sugar.\n\n## Sources\n"
        "- [MedlinePlus: A1C](https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/)\n"
        "- [Random blog](https://blog.example/a1c)",
        _search_call(),
    ))

    jargon = asyncio.run(service_module.openai_service.translate_jargon("A1C"))
    coach = asyncio.run(service_module.openai_service.generate_conversation_coaching("Endocrinology follow-up"))

    for text in (jargon["explanation"], coach["content"]):
        assert "https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/" in text
        assert "blog.example" not in text
    for request in fake.calls:
        assert _web_tools(request) == [service_module.trusted_web_search_tool()]
        assert ai_config.WEB_SEARCH_INSTRUCTIONS in _system_texts(request)
        assert "Search the trusted health sites" in request["input"][-1]["content"]


def test_tools_without_search_cite_only_the_trusted_list(fake_openai, monkeypatch):
    fake = fake_openai(lambda _k, _i: _reply("Explanation."))
    monkeypatch.setattr(settings, "WEB_SEARCH_ENABLED", False)

    asyncio.run(service_module.openai_service.translate_jargon("A1C"))

    request = fake.calls[0]
    assert "tools" not in request
    assert ai_config.WEB_SEARCH_INSTRUCTIONS not in _system_texts(request)
    assert "medlineplus.gov, dailymed.nlm.nih.gov" in request["input"][-1]["content"]


# --- prompts -------------------------------------------------------------------

def test_chat_and_voice_prompts_share_the_answering_guidance():
    for prompt in (
        ai_config.SYSTEM_PROMPT, ai_config.TALK_INSTRUCTIONS, ai_config.TALK_BACKEND_INSTRUCTIONS,
        ai_config.TRUSTED_SEARCH_INSTRUCTIONS,
    ):
        assert ai_config.ANSWERING_WITHIN_BOUNDARIES in prompt
    # The mandatory every-answer disclaimer is gone from the voice prompts.
    for prompt in (ai_config.TALK_INSTRUCTIONS, ai_config.TALK_BACKEND_INSTRUCTIONS):
        assert "say plainly that it is general information and that their care team" not in prompt
        assert "You have no internet access." not in prompt
