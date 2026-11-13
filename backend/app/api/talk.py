"""Talk mode routes (iOS live voice). See services/talk_session_service.py for the design.

Two audiences share this router:

* The app, authenticated as usual (`get_current_user`): status, consent, start, end, poll.
* OpenAI's servers, calling `POST /talk/mcp` on behalf of the delegated model. That route
  is authenticated by the per-call opaque token only, and everything it can touch is
  derived from the `talk_sessions` row the token resolves to.
"""
import logging
from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user, require_ai_data_sharing_consent
from app.api.permissions import check_session_access
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import RateLimits, limiter
from app.models import CONSENT_VERSIONS, ConsentRecord, ConsentType, Session as SessionModel, TalkSession, User
from app.models.talk_session import TalkStatus
from app.services import talk_session_service as talk_service
from app.services import talk_tools
from app.services.entitlement_service import EntitlementCheckUnavailable, has_active_subscription
from app.services.openai_service import sanitize_user_timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/talk", tags=["talk"])

MAX_SDP_CHARS = 20_000
MIN_REMAINING_SECONDS = 60
# Newest first: an unknown requested version gets the first entry. 2025-11-25 is what
# current MCP clients request; this server's subset (stateless tools over JSON, tool
# failures as isError results) is unchanged across these revisions.
MCP_PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _require_enabled() -> None:
    if not settings.TALK_ENABLED:
        raise _error(404, "TALK_DISABLED", "Talk isn't available right now.")


def _has_talk_consent(db: DBSession, user_id: str) -> bool:
    return db.query(ConsentRecord.id).filter(
        ConsentRecord.user_id == user_id, ConsentRecord.consent_type == ConsentType.TALK_VOICE
    ).first() is not None


def _load_own_talk(db: DBSession, talk_id: str, user: User) -> TalkSession:
    talk = db.query(TalkSession).filter(TalkSession.id == talk_id, TalkSession.user_id == user.id).first()
    if not talk:
        raise HTTPException(status_code=404, detail="Talk session not found")
    return talk


def _talk_response(talk: TalkSession) -> dict:
    return {
        "talk_id": talk.id,
        "status": talk_service.effective_status(talk),
        "outcome": talk.outcome,
        "audio_recording_id": talk.audio_recording_id,
        "duration_seconds": talk.duration_seconds,
        "journal_entries_created": talk.journal_entries_created,
    }


# ---------------------------------------------------------------------------
# App-facing routes
# ---------------------------------------------------------------------------

@router.get("/status")
async def talk_status(current_user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Whether Talk can be offered to this user right now (drives the first-use flow)."""
    remaining = 0
    if settings.TALK_ENABLED:
        used = talk_service.seconds_used_today(db, current_user.id)
        remaining = max(0, int(settings.TALK_DAILY_SECONDS_PER_USER - used))
    return {
        "enabled": settings.TALK_ENABLED,
        "has_consent": _has_talk_consent(db, current_user.id),
        "remaining_seconds_today": remaining,
        "max_session_seconds": settings.TALK_MAX_SESSION_SECONDS,
    }


@router.post("/consent")
async def accept_talk_consent(
    request: Request, current_user: User = Depends(get_current_user), db: DBSession = Depends(get_db)
):
    """Record the one-time Talk consent (live streaming to OpenAI + recording)."""
    if _has_talk_consent(db, current_user.id):
        return {"status": "already_consented"}
    info = CONSENT_VERSIONS[ConsentType.TALK_VOICE]
    client_ip = (
        request.headers.get("CF-Connecting-IP")
        or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else None)
    )
    db.add(ConsentRecord(
        user_id=current_user.id, consent_type=ConsentType.TALK_VOICE,
        consent_version=info["version"], consent_text=info["text"],
        ip_address=client_ip, user_agent=request.headers.get("User-Agent", "")[:500],
    ))
    db.commit()
    return {"status": "consented"}


class TalkStartRequest(BaseModel):
    session_id: str = Field(..., max_length=64)
    sdp: str
    user_timezone: Optional[str] = Field(None, max_length=64)
    current_time: Optional[str] = Field(None, max_length=64)


def _recording_name(user_timezone: Optional[str]) -> str:
    tz = sanitize_user_timezone(user_timezone)
    now = datetime.now(ZoneInfo(tz)) if tz else datetime.utcnow()
    return "Talk_" + now.strftime("%Y-%m-%d_%I-%M%p").replace("_0", "_")


@router.post("/sessions", status_code=201)
@limiter.limit(RateLimits.TALK_START)
async def start_talk_session(
    request: Request,
    body: TalkStartRequest,
    current_user: User = Depends(require_ai_data_sharing_consent),
    db: DBSession = Depends(get_db),
):
    """Start a live voice session: exchange the phone's WebRTC offer for OpenAI's answer."""
    _require_enabled()
    if not body.sdp.startswith("v=0") or len(body.sdp) > MAX_SDP_CHARS:
        raise HTTPException(status_code=400, detail="Invalid session description")

    session = db.query(SessionModel).filter(SessionModel.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Care session not found")
    check_session_access(session, current_user.id, db)

    if not _has_talk_consent(db, current_user.id):
        raise _error(403, "TALK_CONSENT_REQUIRED", "Please review how Talk works before starting.")

    user_id, user_name, session_id, session_name = current_user.id, current_user.name, session.id, session.name
    db.rollback()  # nothing below needs this connection until the insert
    try:
        subscribed = await has_active_subscription(user_id)
    except EntitlementCheckUnavailable as e:
        logger.error(f"Talk entitlement check unavailable: {e}")
        raise _error(503, "TALK_UNAVAILABLE", "Talk is temporarily unavailable. Please try again shortly.")
    if not subscribed:
        raise _error(403, "TALK_SUBSCRIPTION_REQUIRED", "Talk requires an active AretaCare subscription.")

    # A previous call whose instance died still holds this user's one live-call slot.
    for stale in db.query(TalkSession).filter(
        TalkSession.user_id == user_id, TalkSession.status == TalkStatus.ACTIVE.value
    ).all():
        if talk_service.is_stale(stale):
            await talk_service.claim_stale_and_finalize(stale.id)
    db.rollback()

    remaining = settings.TALK_DAILY_SECONDS_PER_USER - talk_service.seconds_used_today(db, user_id)
    if remaining < MIN_REMAINING_SECONDS:
        raise _error(429, "TALK_DAILY_LIMIT", "You've reached today's Talk limit. It resets within 24 hours.")
    max_seconds = int(min(settings.TALK_MAX_SESSION_SECONDS, remaining))

    input_items = talk_service.build_session_input(
        db, session_id, user_name=user_name, session_name=session_name,
        user_timezone=body.user_timezone, current_time=body.current_time,
    )
    mcp_token, token_hash = talk_service.new_mcp_token()
    talk = TalkSession(
        session_id=session_id, user_id=user_id, max_seconds=max_seconds,
        mcp_token_hash=token_hash, recording_name=_recording_name(body.user_timezone),
    )
    db.add(talk)
    try:
        db.commit()  # the partial unique index makes this the one-live-call claim
    except IntegrityError:
        db.rollback()
        raise _error(
            409, "TALK_ALREADY_ACTIVE",
            "A Talk conversation is already in progress on this account. End it, or try again in a moment.",
        )
    talk_id = talk.id
    db.rollback()  # release the connection before the OpenAI call

    config = talk_service.build_session_config(
        mcp_token=mcp_token, input_items=input_items,
        user_timezone=body.user_timezone, current_time=body.current_time,
    )
    try:
        openai_session_id, sdp_answer = await talk_service.create_live_session(body.sdp, config)
    except talk_service.TalkUnavailable as e:
        logger.error(f"Talk start failed: {e}")
        db.query(TalkSession).filter(TalkSession.id == talk_id).delete(synchronize_session=False)
        db.commit()
        raise _error(503, "TALK_UNAVAILABLE", "Talk couldn't connect. Please try again shortly.")

    db.query(TalkSession).filter(TalkSession.id == talk_id).update(
        {"openai_session_id": openai_session_id, "heartbeat_at": datetime.utcnow()}, synchronize_session=False
    )
    db.commit()
    talk_service.start_sideband(talk_id, openai_session_id, max_seconds)
    return {"talk_id": talk_id, "sdp": sdp_answer, "max_seconds": max_seconds}


@router.post("/sessions/{talk_id}/end")
async def end_talk_session(
    talk_id: str, current_user: User = Depends(get_current_user), db: DBSession = Depends(get_db)
):
    """End a call. Idempotent; saving continues in the background (poll the GET)."""
    talk = _load_own_talk(db, talk_id, current_user)
    if talk.status == TalkStatus.ACTIVE.value:
        openai_session_id, stale = talk.openai_session_id, talk_service.is_stale(talk)
        db.rollback()
        await talk_service.request_end(talk_id, openai_session_id)
        if stale:
            await talk_service.claim_stale_and_finalize(talk_id)
        talk = _load_own_talk(db, talk_id, current_user)
    return _talk_response(talk)


@router.get("/sessions/{talk_id}")
async def get_talk_session(
    talk_id: str, current_user: User = Depends(get_current_user), db: DBSession = Depends(get_db)
):
    talk = _load_own_talk(db, talk_id, current_user)
    if talk_service.is_stale(talk):
        db.rollback()
        await talk_service.claim_stale_and_finalize(talk_id)
        talk = _load_own_talk(db, talk_id, current_user)
    return _talk_response(talk)


# ---------------------------------------------------------------------------
# MCP endpoint (called by OpenAI for the delegated model)
# ---------------------------------------------------------------------------

def _rpc_result(message_id: Any, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": message_id, "result": result}


def _rpc_error(message_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}


def _mcp_token_from(request: Request) -> Optional[str]:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.headers.get("X-Talk-Token")


def _authenticate_mcp(request: Request, db: DBSession) -> TalkSession:
    """Resolve the per-call token to its live row, or 401. Uniform failure on purpose."""
    token = _mcp_token_from(request)
    talk = None
    if token and token.startswith("talk_") and len(token) < 200:
        talk = db.query(TalkSession).filter(
            TalkSession.mcp_token_hash == talk_service.hash_mcp_token(token),
            TalkSession.status == TalkStatus.ACTIVE.value,
        ).first()
    if talk is None:
        raise HTTPException(status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Bearer"})
    return talk


async def _call_tool(db: DBSession, talk: TalkSession, params: Any) -> dict:
    def text_result(text: str, is_error: bool = False) -> dict:
        return {"content": [{"type": "text", "text": text}], "isError": is_error}

    if not isinstance(params, dict) or not isinstance(params.get("name"), str):
        return text_result("Malformed tool call.", True)
    name = params["name"]
    talk_id, session_id, user_id = talk.id, talk.session_id, talk.user_id

    # Access can be revoked mid-call (collaborator removed, account deactivated).
    user = db.query(User).filter(User.id == user_id).first()
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    try:
        if user is None or not user.is_active or session is None:
            raise HTTPException(status_code=403, detail="Access denied")
        check_session_access(session, user_id, db)
    except HTTPException:
        logger.warning(f"Talk {talk_id}: care-session access no longer valid; ending the call")
        openai_session_id = talk.openai_session_id
        db.rollback()
        await talk_service.request_end(talk_id, openai_session_id)
        return text_result("Access to this care session has ended. Nothing can be read or changed.", True)

    # Atomic budget: bounds a backend model stuck in a tool loop.
    allowed = db.query(TalkSession).filter(
        TalkSession.id == talk_id, TalkSession.status == TalkStatus.ACTIVE.value,
        TalkSession.tool_call_count < settings.TALK_MAX_TOOL_CALLS,
    ).update({"tool_call_count": TalkSession.tool_call_count + 1}, synchronize_session=False)
    db.commit()
    if not allowed:
        return text_result("The tool limit for this conversation has been reached.", True)

    ctx = talk_tools.ToolContext(db=db, talk_id=talk_id, session_id=session_id, user_id=user_id)
    try:
        output = await talk_tools.call_tool(ctx, name, params.get("arguments"))
        logger.info(f"Talk {talk_id}: tool {name} ok")
        return text_result(output)
    except talk_tools.ToolError as e:
        db.rollback()
        logger.info(f"Talk {talk_id}: tool {name} refused")
        return text_result(str(e), True)
    except Exception as e:
        db.rollback()
        logger.error(f"Talk {talk_id}: tool {name} failed: {e}", exc_info=True)
        return text_result("That could not be done because of a server problem.", True)


async def _handle_rpc(db: DBSession, talk: TalkSession, message: Any) -> Optional[dict]:
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
        return _rpc_error(message.get("id") if isinstance(message, dict) else None, -32600, "Invalid request")
    method, message_id, params = message["method"], message.get("id"), message.get("params")
    if "id" not in message:
        return None  # a notification (e.g. notifications/initialized): no response

    if method == "initialize":
        requested = params.get("protocolVersion") if isinstance(params, dict) else None
        return _rpc_result(message_id, {
            "protocolVersion": requested if requested in MCP_PROTOCOL_VERSIONS else MCP_PROTOCOL_VERSIONS[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "aretacare-talk", "version": "1.0.0"},
        })
    if method == "ping":
        return _rpc_result(message_id, {})
    if method == "tools/list":
        return _rpc_result(message_id, {"tools": talk_tools.list_tool_definitions()})
    if method == "tools/call":
        return _rpc_result(message_id, await _call_tool(db, talk, params))
    return _rpc_error(message_id, -32601, "Method not found")


@router.post("/mcp", include_in_schema=False)
async def talk_mcp(request: Request, db: DBSession = Depends(get_db)):
    """Stateless MCP (Streamable HTTP, JSON responses) for the delegated Talk model."""
    _require_enabled()
    talk = _authenticate_mcp(request, db)
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse(_rpc_error(None, -32700, "Parse error"), status_code=400)

    if isinstance(payload, list):
        if not payload or len(payload) > 20:
            return JSONResponse(_rpc_error(None, -32600, "Invalid request"), status_code=400)
        responses = [r for r in [await _handle_rpc(db, talk, m) for m in payload] if r is not None]
        return JSONResponse(responses) if responses else Response(status_code=202)

    response = await _handle_rpc(db, talk, payload)
    return JSONResponse(response) if response is not None else Response(status_code=202)


@router.get("/mcp", include_in_schema=False)
async def talk_mcp_stream():
    """No server-initiated stream: this server only answers requests."""
    return Response(status_code=405, headers={"Allow": "POST"})
