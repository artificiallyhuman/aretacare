"""What AretaCare sends to OpenAI with every request (no network: the client is faked)."""

import asyncio
import importlib
from types import SimpleNamespace

# The module, not the `openai_service` instance that app.services re-exports under the same name.
service_module = importlib.import_module("app.services.openai_service")


class _FakeResponses:
    def __init__(self):
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_text="ok", usage=None, output=[])


class _FakeClient:
    def __init__(self):
        self.responses = _FakeResponses()


async def _no_log(**_):
    return None


def test_chat_requests_are_not_stored_at_openai(monkeypatch):
    fake = _FakeClient()
    monkeypatch.setattr(service_module.openai_service, "client", fake)
    monkeypatch.setattr(service_module, "log_api_call", _no_log)

    text = asyncio.run(service_module.openai_service._create_chat_completion(
        [{"role": "user", "content": "What does CBC stand for?"}], feature="test",
    ))

    assert text == "ok"
    assert fake.responses.calls[0]["store"] is False


def test_journal_profile_and_digest_requests_are_not_stored_at_openai():
    fake = _FakeClient()

    asyncio.run(service_module.guarded_responses_create(fake, model="m", input="synthetic"))

    assert fake.responses.calls[0]["store"] is False
