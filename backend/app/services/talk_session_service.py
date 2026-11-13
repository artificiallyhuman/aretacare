"""Talk mode: live voice conversations on OpenAI's GPT-Live API (iOS only).

How a call is wired:

* The phone creates a WebRTC offer and posts the SDP to `POST /talk/sessions`. This
  module forwards it to OpenAI with the project API key and returns the SDP answer.
  There is no client credential for GPT-Live: the device never holds anything that can
  reach OpenAI on its own, and its data channel is locked to receiving a few events.
* The voice model does not reason over records or call tools. It delegates to a
  Responses model, which calls our MCP endpoint (`POST /talk/mcp`, services/talk_tools.py).
  That endpoint is stateless, so any instance can serve a tool call.
* The instance that created the call attaches a *sideband* WebSocket to it. The
  sideband receives both audio streams and the transcript, heartbeats the row, enforces
  the time limits, and saves the result when the call ends.

What that implies for failure handling. The sideband is one in-process task, so a
deploy or a crash loses it and the audio it was collecting. The transcript is flushed
to the row every few seconds, so whichever instance next sees the stale row claims it
(an atomic `active -> finalizing` UPDATE that only one caller wins) and posts the turns
to the chat instead. Nothing is re-enqueued at startup: with several instances that
would process the same call more than once.

The sideband is opened with `store: false`: the recording lives in our S3, under the
same deletion rules as every other recording, not at OpenAI.
"""
import asyncio
import base64
import contextlib
import hashlib
import json
import logging
import os
import secrets
import subprocess
import tempfile
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import httpx
import sentry_sdk
import websockets

from app.config import ai_config
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AudioRecording, Conversation, JournalEntry, TalkSession
from app.models.audio_recording import AudioRecordingCategory, TranscriptionStatus
from app.models.conversation import MessageRole, MessageType
from app.models.talk_session import TalkOutcome, TalkStatus
from app.services.audio_transcription_service import (
    _FFMPEG_INPUT_GUARD, _stage_limiter, build_audio_keys,
)
from app.services.openai_service import (
    openai_circuit_breaker, openai_service, sanitize_current_time, sanitize_user_timezone,
    wrap_untrusted,
)
from app.services.s3_service import s3_service

logger = logging.getLogger(__name__)

LIVE_SESSIONS_URL = "https://api.openai.com/v1/live/sessions"
LIVE_ATTACH_URL = "wss://api.openai.com/v1/live/sessions/{session_id}/attach"
MCP_SERVER_LABEL = "aretacare"

# Sideband audio is always mono PCM16LE at 24 kHz, whatever the phone negotiated.
PCM_RATE = 24000
PCM_BYTES_PER_MS = PCM_RATE * 2 // 1000
PCM_CHUNK_MS = 200

FLUSH_INTERVAL_SECONDS = 5          # transcript + heartbeat to the row
SPEECH_STAMP_INTERVAL_SECONDS = 1   # last_user_speech_at (read by confirm_action)
WRAP_UP_WARNING_SECONDS = 60
SIDEBAND_MAX_RECONNECTS = 4
MIN_SAVED_CALL_SECONDS = 5
# A 'finalizing' row older than this lost its finalizer; it is reported as failed.
FINALIZING_STALE_SECONDS = 15 * 60
# `message_metadata.status` of a Talk chat card; a finished card has no status.
SUMMARY_SAVING = "saving"
SUMMARY_FAILED = "failed"

# What the phone's data channel may receive. It may send nothing.
DATA_CHANNEL_SERVER_EVENTS = [
    {"type": "session.started"},
    {"type": "session.closed"},
    {"type": "session.delegation.created"},
    {"type": "error"},
]


class TalkUnavailable(Exception):
    """OpenAI could not start the session. The caller answers 503."""


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

def hash_mcp_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_mcp_token() -> Tuple[str, str]:
    """(token, sha256). Opaque on purpose: it is not a JWT, so it can never be accepted
    by `get_current_user`, and an access token can never be accepted here."""
    token = "talk_" + secrets.token_urlsafe(32)
    return token, hash_mcp_token(token)


def mcp_server_url() -> Optional[str]:
    if not settings.API_PUBLIC_URL:
        return None
    return settings.API_PUBLIC_URL.rstrip("/") + "/api/talk/mcp"


# ---------------------------------------------------------------------------
# Session configuration
# ---------------------------------------------------------------------------

def _clip_tokens(value: str, tokens: int) -> str:
    limit = tokens * 4
    return value if len(value) <= limit else value[:limit] + "\n[truncated]"


def build_session_input(
    db, session_id: str, *, user_name: str, session_name: str,
    user_timezone: Optional[str], current_time: Optional[str],
) -> List[dict]:
    """Seed context for the voice model (`session.input`, capped by OpenAI at 8,192 tokens).

    Data only — the rules live in the instructions. The chat gets a far larger context;
    here the profile and recent journal are summaries, and everything deeper is fetched
    on demand through the tools.
    """
    from app.services.journal_service import JournalService

    journal = JournalService(db)
    profile_text = journal._format_profile_context(session_id, ai_config.TALK_PROFILE_TOKENS) or ""
    _older, recent_journal, _profile = journal._build_context_parts(
        session_id, max_tokens=ai_config.TALK_JOURNAL_TOKENS
    )

    tz = sanitize_user_timezone(user_timezone)
    now_text = sanitize_current_time(current_time)
    facts = [
        f"The person speaking is {user_name}." if user_name else "",
        f"This care session is named '{session_name}'." if session_name else "",
        f"Their local time is {now_text}." if now_text else "",
        f"Their timezone is {tz}." if tz else "",
    ]
    reference = "\n".join(f for f in facts if f)
    if profile_text.strip():
        reference += "\n\n" + _clip_tokens(profile_text, ai_config.TALK_PROFILE_TOKENS)
    if (recent_journal or "").strip():
        reference += "\n\n" + _clip_tokens(recent_journal, ai_config.TALK_JOURNAL_TOKENS)

    items: List[dict] = [{
        "type": "message",
        "role": "developer",
        "content": [{"type": "input_text", "text": (
            "Reference material about this care session follows. It is a summary and may be "
            "out of date; look things up through the backend when exactness matters.\n"
            + wrap_untrusted(reference, "care_session_summary")
        )}],
    }]

    rows = db.query(Conversation).filter(
        Conversation.session_id == session_id
    ).order_by(Conversation.id.desc()).limit(ai_config.TALK_HISTORY_MESSAGES).all()
    budget = ai_config.TALK_HISTORY_TOKENS * 4
    history: List[dict] = []
    for msg in rows:  # newest first: keep the most recent that fit
        content = (msg.content or "").strip()
        if not content:
            continue
        content = content if len(content) <= 600 else content[:600] + " [truncated]"
        if len(content) > budget:
            break
        budget -= len(content)
        if msg.role == MessageRole.USER:
            history.append({"type": "message", "role": "user",
                            "content": [{"type": "input_text", "text": content}]})
        else:
            history.append({"type": "message", "role": "assistant",
                            "content": [{"type": "output_text", "text": content}]})
    items.extend(reversed(history))
    return items


def build_session_config(
    *, mcp_token: str, input_items: List[dict],
    user_timezone: Optional[str], current_time: Optional[str],
) -> dict:
    from app.services.talk_tools import TOOL_NAMES

    backend_instructions = ai_config.TALK_BACKEND_INSTRUCTIONS
    tz, now_text = sanitize_user_timezone(user_timezone), sanitize_current_time(current_time)
    if now_text or tz:
        backend_instructions += (
            f"\n\nThe person's local time is {now_text or 'unknown'}"
            f" (timezone {tz or 'unknown'}). Use it to resolve 'today', 'yesterday' and similar."
        )

    responses: dict = {
        "model": ai_config.TALK_BACKEND_MODEL,
        "instructions": backend_instructions,
        "reasoning": {"effort": ai_config.TALK_BACKEND_REASONING_EFFORT},
        "text": {"verbosity": "low"},
    }
    server_url = mcp_server_url()
    if server_url:
        responses["tools"] = [{
            "type": "mcp",
            "server_label": MCP_SERVER_LABEL,
            "server_url": server_url,
            "headers": {"Authorization": f"Bearer {mcp_token}"},
            # Confirmation of writes is enforced by the tools themselves (confirm_action),
            # not by an approval round-trip the phone would have to answer.
            "require_approval": "never",
            "allowed_tools": TOOL_NAMES,
        }]
    else:
        # Local development without a public URL: OpenAI cannot reach the MCP endpoint,
        # so the call runs without tools. Startup validation requires the URL in production.
        logger.warning("API_PUBLIC_URL is not set: Talk session starting without care-session tools")

    return {
        "model": ai_config.TALK_MODEL,
        "instructions": ai_config.TALK_INSTRUCTIONS,
        "audio": {"output": {"voice": ai_config.TALK_VOICE}},
        "input": input_items,
        "store": False,
        "client": {"data_channel": {
            "allowed_client_events": [],
            "allowed_server_events": DATA_CHANNEL_SERVER_EVENTS,
        }},
        "delegation": {"type": "responses", "responses": responses},
    }


def _openai_headers() -> dict:
    return {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}


async def create_live_session(sdp_offer: str, session_config: dict) -> Tuple[str, str]:
    """Create the GPT-Live session. Returns (openai_session_id, sdp_answer)."""
    if openai_circuit_breaker.is_open():
        raise TalkUnavailable("OpenAI circuit breaker is open")
    body = {"session": session_config, "transport": {"type": "webrtc", "sdp": sdp_offer}}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(LIVE_SESSIONS_URL, headers=_openai_headers(), json=body)
    except httpx.HTTPError as e:
        openai_circuit_breaker.record_failure()
        raise TalkUnavailable(f"Live session request failed: {type(e).__name__}") from e

    if response.status_code != 201:
        if response.status_code >= 500 or response.status_code == 429:
            openai_circuit_breaker.record_failure()
        # The error body can echo request content; log only its code and param.
        code = param = None
        try:
            error = response.json().get("error") or {}
            code, param = error.get("code"), error.get("param")
        except ValueError:
            pass
        logger.error(f"Live session create failed: HTTP {response.status_code} code={code} param={param}")
        raise TalkUnavailable(f"Live session create returned HTTP {response.status_code}")

    openai_circuit_breaker.record_success()
    try:
        payload = response.json()
        return payload["session"]["id"], payload["transport"]["sdp"]
    except (ValueError, KeyError, TypeError) as e:
        raise TalkUnavailable("Live session create returned an unexpected body") from e


# ---------------------------------------------------------------------------
# Row access (short-lived sessions; never held across an await on the network)
# ---------------------------------------------------------------------------

def _flush_row(talk_id: str, turns: Optional[List[dict]], last_speech: Optional[datetime],
               duration: Optional[float], heartbeat: Optional[datetime] = None) -> int:
    """Heartbeat + transcript. Returns 0 when the row is no longer this call's to write."""
    values = {"heartbeat_at": heartbeat or datetime.utcnow()}
    if turns is not None:
        values["transcript"] = turns
    if last_speech is not None:
        values["last_user_speech_at"] = last_speech
    if duration is not None:
        values["duration_seconds"] = duration
    db = SessionLocal()
    try:
        count = db.query(TalkSession).filter(
            TalkSession.id == talk_id, TalkSession.status == TalkStatus.ACTIVE.value
        ).update(values, synchronize_session=False)
        db.commit()
        return count
    finally:
        db.close()


def _claim_for_finalizing(talk_id: str, reason: str, turns: Optional[List[dict]],
                          duration: Optional[float], require_stale: bool) -> Optional[dict]:
    """The exclusive claim. Exactly one caller gets a dict back; everyone else gets None."""
    db = SessionLocal()
    try:
        query = db.query(TalkSession).filter(
            TalkSession.id == talk_id, TalkSession.status == TalkStatus.ACTIVE.value
        )
        if require_stale:
            cutoff = datetime.utcnow() - timedelta(seconds=settings.TALK_STALE_SECONDS)
            query = query.filter(TalkSession.heartbeat_at < cutoff)
        values = {"status": TalkStatus.FINALIZING.value, "ended_at": datetime.utcnow(),
                  "end_reason": reason, "pending_actions": None}
        if turns is not None:
            values["transcript"] = turns
        if duration is not None:
            values["duration_seconds"] = duration
        if query.update(values, synchronize_session=False) == 0:
            db.rollback()
            return None
        db.commit()
        talk = db.query(TalkSession).filter(TalkSession.id == talk_id).first()
        from app.models import User
        user = db.query(User).filter(User.id == talk.user_id).first()
        return {
            "session_id": talk.session_id,
            "user_id": talk.user_id,
            "user_name": (user.name if user else "") or "",
            "started_at": talk.started_at,
            "ended_at": talk.ended_at,
            "turns": talk.transcript or [],
            "duration": talk.duration_seconds,
            "recording_name": talk.recording_name,
        }
    finally:
        db.close()


def _finish_row(talk_id: str, status: TalkStatus, outcome: Optional[TalkOutcome], duration: Optional[float],
                audio_recording_id: Optional[int] = None, journal_entries: Optional[int] = None) -> None:
    db = SessionLocal()
    try:
        db.query(TalkSession).filter(TalkSession.id == talk_id).update({
            "status": status.value,
            "outcome": outcome.value if outcome else None,
            "duration_seconds": duration,
            "audio_recording_id": audio_recording_id,
            "journal_entries_created": journal_entries,
        }, synchronize_session=False)
        db.commit()
    finally:
        db.close()


def effective_status(talk: TalkSession) -> str:
    """Status as reported to clients: a finalizer that died must not spin forever."""
    if talk.status == TalkStatus.FINALIZING.value and talk.ended_at is not None:
        if (datetime.utcnow() - talk.ended_at).total_seconds() > FINALIZING_STALE_SECONDS:
            return TalkStatus.FAILED.value
    return talk.status


def is_stale(talk: TalkSession) -> bool:
    return (
        talk.status == TalkStatus.ACTIVE.value
        and (datetime.utcnow() - talk.heartbeat_at).total_seconds() > settings.TALK_STALE_SECONDS
    )


def seconds_used_today(db, user_id: str) -> float:
    """Voice time in the rolling 24 hours, counting a live call's elapsed time."""
    since = datetime.utcnow() - timedelta(hours=24)
    rows = db.query(
        TalkSession.status, TalkSession.started_at, TalkSession.duration_seconds, TalkSession.max_seconds
    ).filter(TalkSession.user_id == user_id, TalkSession.started_at >= since).all()
    total = 0.0
    now = datetime.utcnow()
    for status, started_at, duration, max_seconds in rows:
        if status == TalkStatus.ACTIVE.value:
            total += min((now - started_at).total_seconds(), max_seconds)
        else:
            total += duration or 0.0
    return total


# ---------------------------------------------------------------------------
# Recording and transcript collected from the sideband
# ---------------------------------------------------------------------------

class _Recorder:
    """Both sides of the call as raw PCM on disk (never in memory: 30 minutes is ~170 MB).

    Output chunks carry their position on the session timeline; input chunks carry none.
    Both streams are continuous, so an input segment is anchored by the first output
    chunk that follows it and then written positionally. Anchoring per connection also
    makes a reconnect harmless: the few seconds the server replays land on the same
    offsets instead of being appended twice.
    """

    def __init__(self, talk_id: str):
        self._dir = tempfile.mkdtemp(prefix=f"talk_{talk_id[:8]}_")
        self.input_path = os.path.join(self._dir, "user.pcm")
        self.output_path = os.path.join(self._dir, "agent.pcm")
        self.mp3_path = os.path.join(self._dir, "talk.mp3")
        self._input = open(self.input_path, "w+b")
        self._output = open(self.output_path, "w+b")
        self._segment_base_ms: Optional[int] = None
        self._segment_written_ms = 0
        self._unanchored: List[bytes] = []
        self.input_bytes = 0
        self.output_bytes = 0
        self.end_ms = 0

    def new_connection(self) -> None:
        self._segment_base_ms = None
        self._segment_written_ms = 0
        self._unanchored = []

    def _write_input(self, chunk: bytes) -> None:
        position_ms = self._segment_base_ms + self._segment_written_ms
        self._input.seek(position_ms * PCM_BYTES_PER_MS)
        self._input.write(chunk)
        chunk_ms = len(chunk) // PCM_BYTES_PER_MS
        self._segment_written_ms += chunk_ms
        self.end_ms = max(self.end_ms, position_ms + chunk_ms)

    def add_input(self, chunk: bytes) -> None:
        self.input_bytes += len(chunk)
        if self._segment_base_ms is None:
            self._unanchored.append(chunk)
            if len(self._unanchored) > 50:  # 10 s with no output chunk: anchor on what we know
                self._anchor(self.end_ms)
            return
        self._write_input(chunk)

    def _anchor(self, timeline_now_ms: int) -> None:
        buffered_ms = sum(len(c) for c in self._unanchored) // PCM_BYTES_PER_MS
        self._segment_base_ms = max(0, timeline_now_ms - buffered_ms)
        pending, self._unanchored = self._unanchored, []
        for chunk in pending:
            self._write_input(chunk)

    def add_output(self, chunk: bytes, start_ms: int, end_ms: Optional[int]) -> None:
        self.output_bytes += len(chunk)
        start_ms = max(0, int(start_ms))
        self._output.seek(start_ms * PCM_BYTES_PER_MS)
        self._output.write(chunk)
        chunk_end = int(end_ms) if end_ms is not None else start_ms + len(chunk) // PCM_BYTES_PER_MS
        self.end_ms = max(self.end_ms, chunk_end)
        if self._segment_base_ms is None:
            self._anchor(chunk_end)

    @property
    def has_audio(self) -> bool:
        return self.input_bytes > 0 and self.output_bytes > 0

    def close_files(self) -> None:
        if self._segment_base_ms is None and self._unanchored:
            self._anchor(self.end_ms)
        for handle in (self._input, self._output):
            with contextlib.suppress(Exception):
                handle.close()

    def cleanup(self) -> None:
        # Synchronous on purpose: runs in `finally` and during task cancellation.
        self.close_files()
        import shutil
        shutil.rmtree(self._dir, ignore_errors=True)


def _mix_to_mp3(recorder: _Recorder) -> None:
    """Mix the two mono PCM streams into one mono MP3 (speech: 64 kbps is plenty)."""
    raw = ["-f", "s16le", "-ar", str(PCM_RATE), "-ac", "1"]
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-y", "-v", "error",
            *raw, *_FFMPEG_INPUT_GUARD, "-i", recorder.input_path,
            *raw, *_FFMPEG_INPUT_GUARD, "-i", recorder.output_path,
            "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[m]",
            "-map", "[m]", "-ac", "1", "-acodec", "libmp3lame", "-b:a", "64k",
            recorder.mp3_path,
        ],
        capture_output=True, text=True, timeout=600,
    )
    if result.returncode != 0:
        raise ValueError(f"ffmpeg mix failed: {result.stderr.strip()[:300]}")


class _Transcript:
    """Transcript deltas folded into speaker turns."""

    MAX_TURNS = 2000

    def __init__(self):
        self.turns: List[dict] = []
        self._seen: set = set()
        self.dirty = False

    def add(self, role: str, event: dict) -> None:
        event_id = event.get("event_id")
        if event_id:
            if event_id in self._seen:
                return  # replayed after a reconnect
            self._seen.add(event_id)
        delta = event.get("delta")
        if not isinstance(delta, str) or not delta:
            return
        start_ms, end_ms = int(event.get("start_ms") or 0), int(event.get("end_ms") or 0)
        last = self.turns[-1] if self.turns else None
        if last and last["role"] == role and start_ms - last["end_ms"] < 20_000:
            last["text"] += delta
            last["end_ms"] = max(last["end_ms"], end_ms)
        elif len(self.turns) < self.MAX_TURNS:
            self.turns.append({"role": role, "text": delta.lstrip(), "start_ms": start_ms, "end_ms": end_ms})
        self.dirty = True

    def snapshot(self) -> List[dict]:
        return [dict(t) for t in self.turns]


def _clean_turn(text_value: str) -> str:
    return " ".join((text_value or "").split())


def has_user_speech(turns: List[dict]) -> bool:
    return any(t.get("role") == "user" and _clean_turn(t.get("text", "")) for t in turns)


def format_transcript(turns: List[dict], user_name: str) -> str:
    speaker = (user_name or "").strip().split(" ")[0] or "Caregiver"
    lines = []
    for turn in turns:
        cleaned = _clean_turn(turn.get("text", ""))
        if cleaned:
            lines.append(f"{speaker if turn.get('role') == 'user' else 'AretaCare'}: {cleaned}")
    return "\n\n".join(lines)


def format_duration(seconds: float) -> str:
    seconds = int(round(seconds or 0))
    if seconds < 60:
        return f"{seconds} sec"
    minutes = round(seconds / 60)
    return f"{minutes} min"


# ---------------------------------------------------------------------------
# The sideband task
# ---------------------------------------------------------------------------

_tasks: Dict[str, asyncio.Task] = {}
_end_requests: Dict[str, asyncio.Event] = {}


async def _send(ws, payload: dict) -> None:
    with contextlib.suppress(Exception):
        await ws.send(json.dumps(payload))


async def _run_sideband(talk_id: str, openai_session_id: str, max_seconds: int) -> None:
    recorder = _Recorder(talk_id)
    transcript = _Transcript()
    end_requested = _end_requests[talk_id]
    started = time.monotonic()
    state = {
        "reason": None, "closed": False, "close_sent_at": None, "warned": False,
        "usage_seconds": None, "last_speech": None, "last_speech_mono": started,
        "last_flush": started, "last_speech_stamp": 0.0, "row_gone": False,
    }

    async def flush(force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - state["last_flush"] < FLUSH_INTERVAL_SECONDS:
            return
        state["last_flush"] = now
        turns = transcript.snapshot() if transcript.dirty else None
        transcript.dirty = False
        try:
            if await asyncio.to_thread(_flush_row, talk_id, turns, state["last_speech"], state["usage_seconds"]) == 0:
                state["row_gone"] = True
        except Exception as e:  # a missed beat is harmless; the next tick retries
            logger.warning(f"Talk {talk_id}: heartbeat failed: {e}")
            if turns is not None:
                transcript.dirty = True

    async def request_close(ws, reason: str) -> None:
        if state["close_sent_at"] is None:
            state["reason"] = state["reason"] or reason
            state["close_sent_at"] = time.monotonic()
            await _send(ws, {"type": "session.close"})

    async def handle(ws, event: dict) -> None:
        kind = event.get("type")
        if kind == "session.input_audio.append":
            with contextlib.suppress(Exception):
                recorder.add_input(base64.b64decode(event.get("audio") or ""))
        elif kind == "session.output_audio.delta":
            with contextlib.suppress(Exception):
                recorder.add_output(
                    base64.b64decode(event.get("delta") or ""), event.get("start_ms") or 0, event.get("end_ms")
                )
        elif kind == "session.input_transcript.delta":
            transcript.add("user", event)
            now = time.monotonic()
            state["last_speech"] = datetime.utcnow()
            state["last_speech_mono"] = now
            if now - state["last_speech_stamp"] >= SPEECH_STAMP_INTERVAL_SECONDS:
                # confirm_action (possibly on another instance) reads this from the row.
                state["last_speech_stamp"] = now
                with contextlib.suppress(Exception):
                    await asyncio.to_thread(_flush_row, talk_id, None, state["last_speech"], None)
        elif kind == "session.output_transcript.delta":
            transcript.add("assistant", event)
        elif kind == "session.usage.updated":
            seconds = (event.get("usage") or {}).get("seconds")
            if isinstance(seconds, (int, float)):
                state["usage_seconds"] = float(seconds)
        elif kind == "session.closed":
            state["closed"] = True
            state["reason"] = state["reason"] or str(event.get("reason") or "closed")
            seconds = (event.get("usage") or {}).get("seconds")
            if isinstance(seconds, (int, float)):
                state["usage_seconds"] = float(seconds)
        elif kind == "error":
            error = event.get("error") or {}
            code = error.get("code")
            # Live errors describe configuration (e.g. "Error retrieving tool list from MCP
            # server: 'aretacare'. Http status code: 424"), not conversation content; the
            # message is the only place the reason appears, so keep a bounded copy.
            message = str(error.get("message") or "")[:300]
            line = f"Talk {talk_id}: live error code={code} type={error.get('type')} message={message!r}"
            if code == "responses_validation_failed" or "MCP server" in message:
                # The assistant has no care-session tools for this call: it can talk but
                # cannot read or change anything. Seen so far: 424 = OpenAI reached a server
                # that refused it (a WAF challenge, or our 401); 400 = an http:// URL, whose
                # redirect OpenAI does not follow. The URL is not secret; name it.
                logger.error(f"{line} mcp_url={mcp_server_url()!r}")
            else:
                logger.warning(line)

    async def pump(ws) -> None:
        while not state["closed"]:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            except asyncio.TimeoutError:
                raw = None
            if raw is not None:
                try:
                    event = json.loads(raw)
                except ValueError:
                    event = None
                if isinstance(event, dict):
                    await handle(ws, event)

            now = time.monotonic()
            elapsed = now - started
            if state["close_sent_at"] is not None:
                if now - state["close_sent_at"] > 8:
                    return  # closed without telling us
                continue
            if end_requested.is_set():
                await request_close(ws, "ended_by_user")
            elif state["row_gone"]:
                await request_close(ws, "superseded")
            elif elapsed >= max_seconds:
                await request_close(ws, "time_limit")
            elif now - state["last_speech_mono"] >= settings.TALK_SILENCE_TIMEOUT_SECONDS:
                await request_close(ws, "silence")
            elif (not state["warned"] and max_seconds > 2 * WRAP_UP_WARNING_SECONDS
                  and elapsed >= max_seconds - WRAP_UP_WARNING_SECONDS):
                state["warned"] = True
                await _send(ws, {
                    "type": "session.instructions.append", "delegation_id": None,
                    "content": "About one minute remains in this conversation. At the next natural "
                               "pause, tell the person and help them wrap up.",
                })
            await flush()

    try:
        failures = 0
        while not state["closed"] and state["close_sent_at"] is None:
            try:
                async with websockets.connect(
                    LIVE_ATTACH_URL.format(session_id=openai_session_id),
                    additional_headers=_openai_headers(),
                    max_size=4 * 1024 * 1024, open_timeout=10, ping_interval=20, ping_timeout=20,
                ) as ws:
                    failures = 0
                    recorder.new_connection()
                    await pump(ws)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                failures += 1
                logger.warning(f"Talk {talk_id}: sideband dropped ({type(e).__name__}), attempt {failures}")
                if failures > SIDEBAND_MAX_RECONNECTS:
                    state["reason"] = state["reason"] or "sideband_lost"
                    break
                await asyncio.sleep(min(1.5 * failures, 5))
    except asyncio.CancelledError:
        # Shutdown. The call cannot be saved from here in the time we have: persist the
        # transcript and backdate the heartbeat so another instance claims the row at
        # once and posts the turns to chat. Synchronous: no awaits during cancellation.
        with contextlib.suppress(Exception):
            _flush_row(
                talk_id, transcript.snapshot(), state["last_speech"], state["usage_seconds"],
                heartbeat=datetime.utcnow() - timedelta(seconds=settings.TALK_STALE_SECONDS + 5),
            )
        recorder.cleanup()
        raise

    duration = state["usage_seconds"] or (recorder.end_ms / 1000.0) or (time.monotonic() - started)
    await finalize_talk(
        talk_id, reason=state["reason"] or "closed", turns=transcript.snapshot(),
        recorder=recorder, duration=duration,
    )


def _on_task_done(talk_id: str, task: asyncio.Task) -> None:
    if _tasks.get(talk_id) is task:
        _tasks.pop(talk_id, None)
        _end_requests.pop(talk_id, None)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error(f"Unhandled error in Talk sideband {talk_id}: {exc}", exc_info=exc)
        with contextlib.suppress(Exception):
            sentry_sdk.capture_exception(exc)


def start_sideband(talk_id: str, openai_session_id: str, max_seconds: int) -> asyncio.Task:
    """Launch the sideband detached from the request (create_task + a strong reference:
    a Starlette BackgroundTask would pin the request's DB connection for the whole call)."""
    _end_requests[talk_id] = asyncio.Event()
    task = asyncio.create_task(_run_sideband(talk_id, openai_session_id, max_seconds), name=f"talk-{talk_id}")
    _tasks[talk_id] = task
    task.add_done_callback(lambda t: _on_task_done(talk_id, t))
    return task


async def request_end(talk_id: str, openai_session_id: Optional[str]) -> None:
    """Ask the call to end. The instance holding the sideband closes and saves it; from
    any other instance, close the OpenAI session directly so that sideband sees it end."""
    event = _end_requests.get(talk_id)
    if event is not None:
        event.set()
        return
    if not openai_session_id:
        return
    try:
        async with websockets.connect(
            LIVE_ATTACH_URL.format(session_id=openai_session_id),
            additional_headers=_openai_headers(), open_timeout=5, max_size=4 * 1024 * 1024,
        ) as ws:
            await ws.send(json.dumps({"type": "session.close"}))
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                raw = await asyncio.wait_for(ws.recv(), timeout=deadline - time.monotonic())
                with contextlib.suppress(ValueError):
                    if json.loads(raw).get("type") == "session.closed":
                        return
    except Exception:
        # Already closed (the phone hanging up closes it within a second) or unreachable.
        pass


async def shutdown_talk_sessions() -> None:
    """Shutdown hook: stop every sideband so its transcript is flushed and claimable."""
    tasks = list(_tasks.values())
    if not tasks:
        return
    logger.warning(f"Shutdown: stopping {len(tasks)} live Talk session(s); their transcripts are kept")
    for task in tasks:
        task.cancel()
    await asyncio.wait(tasks, timeout=5)


# ---------------------------------------------------------------------------
# Finalization
# ---------------------------------------------------------------------------

_finalizers: set = set()


async def claim_stale_and_finalize(talk_id: str) -> bool:
    """Take over a call whose instance died: claim it now, save its transcript in the
    background. The claim commits before this returns, so the caller can rely on the
    row no longer being 'active' (it frees the user's one-live-call slot)."""
    claimed = await asyncio.to_thread(_claim_for_finalizing, talk_id, "instance_lost", None, None, True)
    if claimed is None:
        return False
    task = asyncio.create_task(
        finalize_talk(talk_id, reason="instance_lost", preclaimed=claimed), name=f"talk-finalize-{talk_id}"
    )
    _finalizers.add(task)
    task.add_done_callback(_finalizers.discard)
    return True


async def finalize_talk(
    talk_id: str, *, reason: str, turns: Optional[List[dict]] = None,
    recorder: Optional[_Recorder] = None, duration: Optional[float] = None,
    preclaimed: Optional[dict] = None,
) -> None:
    """Save a finished call. Safe to call from several places: the claim is exclusive."""
    card_id: Optional[int] = None
    session_id: Optional[str] = None
    try:
        claimed = preclaimed or await asyncio.to_thread(
            _claim_for_finalizing, talk_id, reason, turns, duration, False
        )
        if claimed is None:
            return
        turns = claimed["turns"]
        duration = claimed["duration"]
        if duration is None:
            duration = max((t.get("end_ms", 0) for t in turns), default=0) / 1000.0

        if duration < MIN_SAVED_CALL_SECONDS or not has_user_speech(turns):
            await asyncio.to_thread(_finish_row, talk_id, TalkStatus.COMPLETED, TalkOutcome.DISCARDED, duration)
            return

        # The chat card goes in now, as "saving"; mixing, upload and journal synthesis take
        # a while, and the finished summary replaces this same row.
        session_id = claimed["session_id"]
        card_id = await asyncio.to_thread(_insert_saving_card, talk_id, session_id, duration)

        recording_id = None
        if recorder is not None and recorder.has_audio:
            try:
                recording_id = await _save_recording(talk_id, claimed, turns, duration, recorder)
            except Exception as e:
                logger.error(f"Talk {talk_id}: saving the recording failed, keeping the transcript: {e}", exc_info=True)
                with contextlib.suppress(Exception):
                    sentry_sdk.capture_exception(e)

        if recording_id is not None:
            entries = await _synthesize_and_summarize_audio(talk_id, claimed, turns, duration, recording_id, card_id)
            await asyncio.to_thread(
                _finish_row, talk_id, TalkStatus.COMPLETED, TalkOutcome.AUDIO, duration, recording_id, entries
            )
        else:
            entries = await _save_transcript_only(talk_id, claimed, turns, duration, card_id)
            await asyncio.to_thread(
                _finish_row, talk_id, TalkStatus.COMPLETED, TalkOutcome.TRANSCRIPT_ONLY, duration, None, entries
            )
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Talk {talk_id}: finalization failed: {e}", exc_info=True)
        with contextlib.suppress(Exception):
            sentry_sdk.capture_exception(e)
        with contextlib.suppress(Exception):
            await asyncio.to_thread(_finish_row, talk_id, TalkStatus.FAILED, None, duration)
        if card_id is not None and session_id is not None:
            # The app shows its own "couldn't save" banner; a card stuck on "saving" would lie.
            with contextlib.suppress(Exception):
                await asyncio.to_thread(_delete_card, card_id, session_id)
    finally:
        if recorder is not None:
            recorder.cleanup()


def _insert_recording(claimed: dict, s3_key: str, filename: str, duration: float, transcript_text: str) -> int:
    db = SessionLocal()
    try:
        recording = AudioRecording(
            session_id=claimed["session_id"], filename=filename, s3_key=s3_key, duration=duration,
            transcribed_text=transcript_text,
            transcription_status=TranscriptionStatus.COMPLETED.value,
            transcription_updated_at=datetime.utcnow(),
            created_by_user_id=claimed["user_id"],
        )
        db.add(recording)
        db.commit()
        return recording.id
    finally:
        db.close()


async def _save_recording(talk_id: str, claimed: dict, turns: List[dict], duration: float,
                          recorder: _Recorder) -> int:
    recorder.close_files()
    name = claimed["recording_name"] or f"Talk_{claimed['started_at'].strftime('%Y-%m-%d_%H%M')}"
    filename = f"{name}.mp3"
    # Same per-instance limit as upload transcoding: both run ffmpeg on a small box.
    async with _stage_limiter(True):
        await asyncio.to_thread(_mix_to_mp3, recorder)
    _source_key, mp3_key = build_audio_keys(claimed["session_id"], name, ".mp3")
    if not await s3_service.upload_file_from_path(recorder.mp3_path, mp3_key, "audio/mpeg", filename):
        raise RuntimeError("S3 upload of the Talk recording failed")
    try:
        return await asyncio.to_thread(
            _insert_recording, claimed, mp3_key, filename, duration,
            format_transcript(turns, claimed["user_name"]),
        )
    except Exception:
        await s3_service.delete_file(mp3_key)  # no row will ever point at it
        raise


def _count_entries_for_recording(recording_id: int) -> int:
    db = SessionLocal()
    try:
        return db.query(JournalEntry).filter(JournalEntry.source_audio_id == recording_id).count()
    finally:
        db.close()


def _set_recording_category(recording_id: int, category: Optional[str], summary: Optional[str]) -> None:
    db = SessionLocal()
    try:
        values = {}
        if summary:
            values["ai_summary"] = summary
        if category:
            with contextlib.suppress(ValueError):
                values["category"] = AudioRecordingCategory(category)
        if values:
            db.query(AudioRecording).filter(AudioRecording.id == recording_id).update(
                values, synchronize_session=False
            )
            db.commit()
    finally:
        db.close()


def _insert_messages(session_id: str, rows: List[dict]) -> List[int]:
    db = SessionLocal()
    try:
        created = []
        for row in rows:
            message = Conversation(session_id=session_id, message_type=MessageType.TEXT, **row)
            db.add(message)
            created.append(message)
        db.commit()
        return [m.id for m in created]
    finally:
        db.close()


def _insert_saving_card(talk_id: str, session_id: str, duration: float) -> int:
    (card_id,) = _insert_messages(session_id, [{
        "role": MessageRole.ASSISTANT,
        "content": f"Talk conversation ({format_duration(duration)}). Saving the recording and transcript…",
        "synthesized_to_journal": True,
        "message_metadata": {
            "kind": "talk_summary", "status": SUMMARY_SAVING, "talk_id": talk_id,
            "duration_seconds": round(duration, 1),
        },
    }])
    return card_id


def _update_card(card_id: int, session_id: str, content: str, metadata: dict) -> None:
    """Fill in the finished summary. A card deleted meanwhile (the user reset the chat
    past it) stays deleted."""
    db = SessionLocal()
    try:
        db.query(Conversation).filter(
            Conversation.id == card_id, Conversation.session_id == session_id
        ).update({"content": content, "message_metadata": metadata}, synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _delete_card(card_id: int, session_id: str) -> None:
    db = SessionLocal()
    try:
        db.query(Conversation).filter(
            Conversation.id == card_id, Conversation.session_id == session_id
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def effective_summary_card(content: str, metadata: Optional[dict], created_at: Optional[datetime]):
    """(content, metadata) as clients should see a Talk card: one still "saving" after a
    finalizer would have finished is reported failed (the instance died mid-save), the same
    rule `effective_status` applies to the call itself."""
    if (
        isinstance(metadata, dict) and metadata.get("kind") == "talk_summary"
        and metadata.get("status") == SUMMARY_SAVING and created_at is not None
        and (datetime.utcnow() - created_at).total_seconds() > FINALIZING_STALE_SECONDS
    ):
        duration = metadata.get("duration_seconds") or 0
        return (
            f"Talk conversation ({format_duration(duration)}). It could not be saved.",
            {**metadata, "status": SUMMARY_FAILED},
        )
    return content, metadata


async def _synthesize_journal(claimed: dict, filename: str, transcript_text: str, summary: str,
                              duration: float, recording_id: Optional[int]) -> None:
    from datetime import date as date_type

    from app.services.journal_service import JournalService

    db = SessionLocal()
    try:
        await JournalService(db).synthesize_from_audio(
            filename=filename, transcribed_text=transcript_text, ai_summary=summary or "",
            duration=duration, session_id=claimed["session_id"], entry_date=date_type.today(),
            audio_id=recording_id, user_id=claimed["user_id"], talk_conversation=True,
        )
    except Exception as e:
        # The recording/transcript is already saved; synthesis failing must not undo that.
        logger.warning(f"Talk journal synthesis failed: {e}")
    finally:
        db.close()


def _entries_phrase(count: int) -> str:
    if count <= 0:
        return ""
    return f" {count} journal {'entry was' if count == 1 else 'entries were'} created from it."


async def _synthesize_and_summarize_audio(talk_id: str, claimed: dict, turns: List[dict],
                                          duration: float, recording_id: int, card_id: int) -> int:
    transcript_text = format_transcript(turns, claimed["user_name"])
    filename = f"{claimed['recording_name'] or 'Talk'}.mp3"
    summary = ""
    try:
        result = await openai_service.categorize_audio_recording(
            transcript_text, duration=duration, user_id=claimed["user_id"]
        )
        summary = (result or {}).get("summary") or ""
        await asyncio.to_thread(_set_recording_category, recording_id, (result or {}).get("category"), summary)
    except Exception as e:
        logger.warning(f"Talk {talk_id}: categorization failed: {e}")

    await _synthesize_journal(claimed, filename, transcript_text, summary, duration, recording_id)
    entries = await asyncio.to_thread(_count_entries_for_recording, recording_id)

    content = (
        f"Talk conversation ({format_duration(duration)}). The recording and transcript are saved "
        f"in Audio Recordings.{_entries_phrase(entries)}"
    )
    # Deliberately no `audio_recording_id` on the row: "Reset from here" deletes the
    # recordings linked to deleted messages, and a Talk recording is its own record.
    await asyncio.to_thread(_update_card, card_id, claimed["session_id"], content, {
        "kind": "talk_summary", "outcome": TalkOutcome.AUDIO.value, "talk_id": talk_id,
        "audio_recording_id": recording_id, "duration_seconds": round(duration, 1),
        "journal_entries": entries,
    })
    return entries


def _count_recent_ai_entries(session_id: str, since: datetime) -> int:
    db = SessionLocal()
    try:
        return db.query(JournalEntry).filter(
            JournalEntry.session_id == session_id, JournalEntry.created_at >= since,
            JournalEntry.created_by == "ai", JournalEntry.source_audio_id.is_(None),
            JournalEntry.source_document_id.is_(None), JournalEntry.source_message_ids.is_(None),
        ).count()
    finally:
        db.close()


async def _save_transcript_only(talk_id: str, claimed: dict, turns: List[dict], duration: float,
                                card_id: int) -> int:
    """The audio is gone: post the conversation into the chat as if it had been typed."""
    # The summary below says the text is "above", so the saving card can't stay where it is.
    await asyncio.to_thread(_delete_card, card_id, claimed["session_id"])
    rows = []
    for turn in turns:
        cleaned = _clean_turn(turn.get("text", ""))
        if not cleaned:
            continue
        is_user = turn.get("role") == "user"
        rows.append({
            "role": MessageRole.USER if is_user else MessageRole.ASSISTANT,
            "content": cleaned,
            "created_by_user_id": claimed["user_id"] if is_user else None,
            # Synthesised as one conversation below, not message by message.
            "synthesized_to_journal": True,
            "message_metadata": {"kind": "talk_turn", "talk_id": talk_id},
        })
    await asyncio.to_thread(_insert_messages, claimed["session_id"], rows)

    synthesis_started = datetime.utcnow()
    await _synthesize_journal(
        claimed, "Talk conversation", format_transcript(turns, claimed["user_name"]), "", duration, None
    )
    entries = await asyncio.to_thread(_count_recent_ai_entries, claimed["session_id"], synthesis_started)

    content = (
        f"That was a Talk conversation ({format_duration(duration)}), saved above as text. "
        f"The audio recording could not be saved.{_entries_phrase(entries)}"
    )
    await asyncio.to_thread(_insert_messages, claimed["session_id"], [{
        "role": MessageRole.ASSISTANT, "content": content, "synthesized_to_journal": True,
        "message_metadata": {
            "kind": "talk_summary", "outcome": TalkOutcome.TRANSCRIPT_ONLY.value, "talk_id": talk_id,
            "audio_recording_id": None, "duration_seconds": round(duration, 1), "journal_entries": entries,
        },
    }])
    return entries
