"""Tools the Talk backend model can call, served over MCP by api/talk.py.

Every tool runs for exactly one live call: the care session and the user come from the
`talk_sessions` row that the caller's token resolved to, never from tool arguments, and
every lookup repeats the `session_id` predicate — record ids are sequential integers,
so an id alone must never be enough to reach a record.

Writes are two-step. `propose_*` stores the intended change on the call's row and
returns a read-back; `confirm_action` applies it, and only if the user has been heard
speaking since the proposal. That check is here, in code, because a prompt instruction
("ask before saving") is not a control: a transcribed document or a misheard sentence
can talk a model into calling a tool.
"""
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional

from sqlalchemy import desc, or_
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    AudioRecording, Conversation, DailyPlan, Document, JournalEntry, Profile, TalkSession,
)
from app.models.journal import EntryType
from app.schemas.journal import JournalEntryCreate, JournalEntryUpdate
from app.schemas.profile import PendingChange
from app.services.openai_service import _strip_markdown_images, wrap_untrusted

logger = logging.getLogger(__name__)

# The user must be heard at least this long after a proposal for it to count as their
# answer (the tail of the request that triggered the proposal is not a "yes").
CONFIRM_MIN_SPEECH_GAP_SECONDS = 1.5
PENDING_ACTION_TTL_SECONDS = 180
MAX_PENDING_ACTIONS = 5
MAX_PENDING_PROFILE_CHANGES = 50

MAX_TOOL_OUTPUT_CHARS = 24_000
MAX_ENTRY_CHARS = 2_000
MAX_JOURNAL_CONTENT_CHARS = 8_000
MAX_DESCRIPTION_CHARS = 1_000
MAX_DATE_RANGE_DAYS = 31

PROFILE_LIST_SECTIONS = ("caregivers", "providers", "conditions", "medications", "allergies", "events")
PROFILE_PREFERENCE_LISTS = ("communication_preferences", "caregiving_guidelines", "important_context")
PROFILE_PREFERENCE_TEXT = ("emergency_instructions", "additional_notes")
PROFILE_SECTIONS = ("patient",) + PROFILE_LIST_SECTIONS + PROFILE_PREFERENCE_LISTS + PROFILE_PREFERENCE_TEXT


class ToolError(Exception):
    """A failure the backend model should hear about and relay (bad input, not found)."""


@dataclass
class ToolContext:
    db: DBSession
    talk_id: str
    session_id: str
    user_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _records(text: str) -> str:
    """Care-session content going back to the model: sanitised, bounded, marked as data."""
    cleaned = _strip_markdown_images(text or "")
    if len(cleaned) > MAX_TOOL_OUTPUT_CHARS:
        cleaned = cleaned[:MAX_TOOL_OUTPUT_CHARS] + "\n[truncated - ask for something more specific]"
    return wrap_untrusted(cleaned, "care_session_records")


def _clip(text: Optional[str], limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit] + " [truncated]"


def _str_arg(args: dict, name: str, *, required: bool = False, max_len: int = 500) -> Optional[str]:
    value = args.get(name)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ToolError(f"'{name}' is required.")
        return None
    if not isinstance(value, str):
        raise ToolError(f"'{name}' must be text.")
    value = value.strip()
    if len(value) > max_len:
        raise ToolError(f"'{name}' is too long (limit {max_len} characters).")
    return value


def _int_arg(args: dict, name: str, *, required: bool = False) -> Optional[int]:
    value = args.get(name)
    if value is None:
        if required:
            raise ToolError(f"'{name}' is required.")
        return None
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ToolError(f"'{name}' must be a whole number.")
    try:
        return int(value)
    except ValueError:
        raise ToolError(f"'{name}' must be a whole number.")


def _date_arg(args: dict, name: str, *, required: bool = False) -> Optional[date]:
    value = _str_arg(args, name, required=required, max_len=10)
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ToolError(f"'{name}' must be a date in YYYY-MM-DD form.")


def _entry_type_arg(args: dict, *, required: bool) -> Optional[EntryType]:
    value = _str_arg(args, "entry_type", required=required, max_len=40)
    if value is None:
        return None
    try:
        return EntryType(value.upper())
    except ValueError:
        raise ToolError("'entry_type' must be one of: " + ", ".join(t.value for t in EntryType) + ".")


def _format_entry(entry: JournalEntry, limit: int = MAX_ENTRY_CHARS) -> str:
    return (
        f"[entry_id {entry.id}] {entry.entry_date.isoformat()} | {entry.entry_type.value} | {entry.title}\n"
        f"{_clip(entry.content, limit)}"
    )


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------

async def _get_health_profile(ctx: ToolContext, args: dict) -> str:
    profile = ctx.db.query(Profile).filter(Profile.session_id == ctx.session_id).first()
    if not profile or not profile.profile_data:
        return "This care session has no Health Profile yet."
    refreshed = max(
        (d for d in (profile.last_ai_update, profile.last_user_update, profile.created_at) if d),
        default=None,
    )
    pending = len(profile.pending_changes or [])
    header = (
        f"Health Profile (a snapshot, last refreshed {refreshed.date().isoformat() if refreshed else 'unknown'}; "
        f"{pending} suggested change(s) waiting for review). Item ids are for suggest_profile_change.\n"
    )
    return header + _records(json.dumps(profile.profile_data, ensure_ascii=False, default=str))


async def _search_journal(ctx: ToolContext, args: dict) -> str:
    query = _str_arg(args, "query", required=True, max_len=500)
    start, end = _date_arg(args, "start_date"), _date_arg(args, "end_date")

    found: Dict[int, JournalEntry] = {}
    # Meaning first (pgvector), then literal matches the embedding may rank low
    # (a drug name, a surname). Both are scoped to this care session.
    from app.services.embedding_service import EmbeddingService
    try:
        similar = await EmbeddingService(ctx.db).find_similar_entries(
            session_id=ctx.session_id, query_text=query, top_k=8, min_days_old=-1,
        )
        for entry, _score in similar:
            found[entry.id] = entry
    except Exception as e:  # non-fatal: keyword search still runs
        logger.warning(f"Talk journal semantic search failed: {e}")

    like = f"%{query.replace('%', '').replace('_', ' ')[:100]}%"
    keyword = ctx.db.query(JournalEntry).filter(
        JournalEntry.session_id == ctx.session_id,
        or_(JournalEntry.title.ilike(like), JournalEntry.content.ilike(like)),
    ).order_by(desc(JournalEntry.entry_date)).limit(8).all()
    for entry in keyword:
        found.setdefault(entry.id, entry)

    entries = [
        e for e in found.values()
        if (start is None or e.entry_date >= start) and (end is None or e.entry_date <= end)
    ]
    if not entries:
        return "No journal entries matched."
    entries.sort(key=lambda e: e.entry_date, reverse=True)
    return _records("\n\n".join(_format_entry(e) for e in entries[:10]))


async def _get_journal_entries(ctx: ToolContext, args: dict) -> str:
    start = _date_arg(args, "start_date", required=True)
    end = _date_arg(args, "end_date") or start
    if end < start:
        raise ToolError("'end_date' must not be before 'start_date'.")
    if (end - start).days > MAX_DATE_RANGE_DAYS:
        raise ToolError(f"Ask for at most {MAX_DATE_RANGE_DAYS} days at a time.")
    entries = ctx.db.query(JournalEntry).filter(
        JournalEntry.session_id == ctx.session_id,
        JournalEntry.entry_date >= start,
        JournalEntry.entry_date <= end,
    ).order_by(JournalEntry.entry_date, JournalEntry.created_at).limit(60).all()
    if not entries:
        return f"No journal entries between {start.isoformat()} and {end.isoformat()}."
    return _records("\n\n".join(_format_entry(e) for e in entries))


async def _list_documents(ctx: ToolContext, args: dict) -> str:
    search = _str_arg(args, "search", max_len=100)
    q = ctx.db.query(Document).filter(Document.session_id == ctx.session_id)
    if search:
        like = f"%{search.replace('%', '')}%"
        q = q.filter(or_(Document.filename.ilike(like), Document.ai_description.ilike(like)))
    docs = q.order_by(desc(Document.uploaded_at)).limit(30).all()
    if not docs:
        return "No documents found."
    return _records("\n".join(
        f"[document_id {d.id}] {d.uploaded_at.date().isoformat()} | "
        f"{d.category.value if d.category else 'other'} | {d.filename} | {_clip(d.ai_description, 300)}"
        for d in docs
    ))


def _load_document(ctx: ToolContext, document_id: int) -> Document:
    doc = ctx.db.query(Document).filter(
        Document.id == document_id, Document.session_id == ctx.session_id
    ).first()
    if not doc:
        raise ToolError("No document with that id in this care session.")
    return doc


def _load_recording(ctx: ToolContext, recording_id: int) -> AudioRecording:
    rec = ctx.db.query(AudioRecording).filter(
        AudioRecording.id == recording_id, AudioRecording.session_id == ctx.session_id
    ).first()
    if not rec:
        raise ToolError("No audio recording with that id in this care session.")
    return rec


def _load_entry(ctx: ToolContext, entry_id: int) -> JournalEntry:
    entry = ctx.db.query(JournalEntry).filter(
        JournalEntry.id == entry_id, JournalEntry.session_id == ctx.session_id
    ).first()
    if not entry:
        raise ToolError("No journal entry with that id in this care session.")
    return entry


async def _get_document_text(ctx: ToolContext, args: dict) -> str:
    doc = _load_document(ctx, _int_arg(args, "document_id", required=True))
    if not (doc.extracted_text or "").strip():
        return (
            f"'{doc.filename}' has no extracted text (it may be an image or a scan). "
            f"Its description: {_clip(doc.ai_description, 600) or 'none'}"
        )
    return f"Text of '{doc.filename}':\n" + _records(doc.extracted_text)


async def _list_audio_recordings(ctx: ToolContext, args: dict) -> str:
    search = _str_arg(args, "search", max_len=100)
    q = ctx.db.query(AudioRecording).filter(AudioRecording.session_id == ctx.session_id)
    if search:
        like = f"%{search.replace('%', '')}%"
        q = q.filter(or_(AudioRecording.ai_summary.ilike(like), AudioRecording.transcribed_text.ilike(like)))
    recs = q.order_by(desc(AudioRecording.created_at)).limit(30).all()
    if not recs:
        return "No audio recordings found."
    return _records("\n".join(
        f"[recording_id {r.id}] {r.created_at.date().isoformat()} | "
        f"{r.category.value if r.category else 'other'} | {r.filename} | {_clip(r.ai_summary, 300)}"
        for r in recs
    ))


async def _get_recording_transcript(ctx: ToolContext, args: dict) -> str:
    rec = _load_recording(ctx, _int_arg(args, "recording_id", required=True))
    if not (rec.transcribed_text or "").strip():
        return f"'{rec.filename}' has no transcript."
    return f"Transcript of '{rec.filename}':\n" + _records(rec.transcribed_text)


async def _get_daily_digest(ctx: ToolContext, args: dict) -> str:
    target = _date_arg(args, "date")
    q = ctx.db.query(DailyPlan).filter(DailyPlan.session_id == ctx.session_id)
    if target:
        q = q.filter(DailyPlan.date == target)
    plan = q.order_by(desc(DailyPlan.date)).first()
    if not plan:
        return "No Daily Digest for that date." if target else "No Daily Digest has been generated yet."
    return f"Daily Digest for {plan.date.isoformat()}:\n" + _records(plan.user_edited_content or plan.content)


async def _get_recent_chat(ctx: ToolContext, args: dict) -> str:
    limit = max(1, min(_int_arg(args, "limit") or 20, 40))
    rows = ctx.db.query(Conversation).filter(
        Conversation.session_id == ctx.session_id
    ).order_by(desc(Conversation.id)).limit(limit).all()
    if not rows:
        return "There are no typed chat messages yet."
    return _records("\n\n".join(
        f"{m.created_at.date().isoformat()} {m.role.value}: {_clip(m.content, 1200)}" for m in reversed(rows)
    ))


# ---------------------------------------------------------------------------
# Proposed writes
# ---------------------------------------------------------------------------

def _lock_talk(ctx: ToolContext) -> TalkSession:
    talk = ctx.db.query(TalkSession).filter(TalkSession.id == ctx.talk_id).with_for_update().first()
    if not talk or talk.status != "active":
        raise ToolError("This conversation has ended; nothing can be changed now.")
    return talk


def _store_proposal(ctx: ToolContext, kind: str, params: dict, read_back: str) -> str:
    talk = _lock_talk(ctx)
    now = datetime.utcnow()
    fresh = [
        a for a in (talk.pending_actions or [])
        if (now - datetime.fromisoformat(a["proposed_at"])).total_seconds() < PENDING_ACTION_TTL_SECONDS
    ]
    action = {
        "id": uuid.uuid4().hex[:10],
        "kind": kind,
        "params": params,
        "read_back": read_back,
        "proposed_at": now.isoformat(),
    }
    talk.pending_actions = (fresh + [action])[-MAX_PENDING_ACTIONS:]
    flag_modified(talk, "pending_actions")
    ctx.db.commit()
    return (
        f"NOT SAVED YET. action_id: {action['id']}. Read this back to the person and ask them to "
        f"confirm with a clear yes or no: {read_back} "
        "When they have said yes, call confirm_action with this action_id in a later turn."
    )


async def _propose_journal_entry(ctx: ToolContext, args: dict) -> str:
    title = _str_arg(args, "title", required=True, max_len=100)
    content = _str_arg(args, "content", required=True, max_len=MAX_JOURNAL_CONTENT_CHARS)
    entry_type = _entry_type_arg(args, required=True)
    entry_date = _date_arg(args, "entry_date") or date.today()
    if entry_date > date.today() + timedelta(days=366):
        raise ToolError("'entry_date' is too far in the future.")
    return _store_proposal(
        ctx, "journal_create",
        {"title": title, "content": content, "entry_type": entry_type.value, "entry_date": entry_date.isoformat()},
        f"Add a journal entry dated {entry_date.isoformat()} titled '{title}': {content}",
    )


async def _propose_journal_edit(ctx: ToolContext, args: dict) -> str:
    entry = _load_entry(ctx, _int_arg(args, "entry_id", required=True))
    params: Dict[str, Any] = {"entry_id": entry.id}
    changes: List[str] = []
    title = _str_arg(args, "title", max_len=100)
    content = _str_arg(args, "content", max_len=MAX_JOURNAL_CONTENT_CHARS)
    entry_type = _entry_type_arg(args, required=False)
    entry_date = _date_arg(args, "entry_date")
    if title:
        params["title"] = title
        changes.append(f"title to '{title}'")
    if content:
        params["content"] = content
        changes.append(f"text to: {content}")
    if entry_type:
        params["entry_type"] = entry_type.value
        changes.append(f"type to {entry_type.value}")
    if entry_date:
        params["entry_date"] = entry_date.isoformat()
        changes.append(f"date to {entry_date.isoformat()}")
    if not changes:
        raise ToolError("Give at least one of title, content, entry_type or entry_date to change.")
    return _store_proposal(
        ctx, "journal_edit", params,
        f"Change the journal entry '{entry.title}' from {entry.entry_date.isoformat()}: " + "; ".join(changes),
    )


async def _propose_description_update(ctx: ToolContext, args: dict) -> str:
    kind = _str_arg(args, "item_type", required=True, max_len=20)
    description = _str_arg(args, "description", required=True, max_len=MAX_DESCRIPTION_CHARS)
    item_id = _int_arg(args, "item_id", required=True)
    if kind == "document":
        name = _load_document(ctx, item_id).filename
    elif kind == "recording":
        name = _load_recording(ctx, item_id).filename
    else:
        raise ToolError("'item_type' must be 'document' or 'recording'.")
    return _store_proposal(
        ctx, "description_update", {"item_type": kind, "item_id": item_id, "description": description},
        f"Change the description of the {kind} '{name}' to: {description}",
    )


async def _propose_generate_digest(ctx: ToolContext, args: dict) -> str:
    user_date = _date_arg(args, "date") or date.today()
    return _store_proposal(
        ctx, "generate_digest", {"date": user_date.isoformat()},
        f"Generate the Daily Digest for {user_date.isoformat()}.",
    )


async def _cancel_action(ctx: ToolContext, args: dict) -> str:
    action_id = _str_arg(args, "action_id", required=True, max_len=32)
    talk = _lock_talk(ctx)
    remaining = [a for a in (talk.pending_actions or []) if a.get("id") != action_id]
    talk.pending_actions = remaining
    flag_modified(talk, "pending_actions")
    ctx.db.commit()
    return "Cancelled. Nothing was saved."


async def _confirm_action(ctx: ToolContext, args: dict) -> str:
    action_id = _str_arg(args, "action_id", required=True, max_len=32)
    talk = _lock_talk(ctx)
    pending = list(talk.pending_actions or [])
    action = next((a for a in pending if a.get("id") == action_id), None)
    if action is None:
        ctx.db.rollback()
        raise ToolError("No pending action with that id. Propose the change again.")

    now = datetime.utcnow()
    proposed_at = datetime.fromisoformat(action["proposed_at"])
    if (now - proposed_at).total_seconds() > PENDING_ACTION_TTL_SECONDS:
        talk.pending_actions = [a for a in pending if a.get("id") != action_id]
        flag_modified(talk, "pending_actions")
        ctx.db.commit()
        raise ToolError("That proposal expired. Propose the change again and ask the person to confirm.")

    heard = talk.last_user_speech_at
    if heard is None or (heard - proposed_at).total_seconds() < CONFIRM_MIN_SPEECH_GAP_SECONDS:
        ctx.db.rollback()
        raise ToolError(
            "Not confirmed: the person has not answered since this was proposed. Read the change "
            "back to them, wait for a clear yes, then call confirm_action."
        )

    # Remove the action before applying it so a repeated confirm cannot apply it twice.
    talk.pending_actions = [a for a in pending if a.get("id") != action_id]
    flag_modified(talk, "pending_actions")
    ctx.db.commit()

    try:
        return await _apply_action(ctx, action["kind"], action["params"])
    except ToolError:
        raise
    except Exception as e:
        ctx.db.rollback()
        logger.error(f"Talk {ctx.talk_id}: applying {action['kind']} failed: {e}", exc_info=True)
        raise ToolError("Saving failed because of a server problem. Nothing was changed; it can be tried again.")


async def _apply_action(ctx: ToolContext, kind: str, params: dict) -> str:
    from app.services.journal_service import JournalService

    if kind == "journal_create":
        entry = await JournalService(ctx.db).create_entry(
            session_id=ctx.session_id,
            entry_data=JournalEntryCreate(
                title=params["title"], content=params["content"],
                entry_type=EntryType(params["entry_type"]), entry_date=date.fromisoformat(params["entry_date"]),
            ),
            created_by=ctx.user_id,
        )
        return f"Saved journal entry '{entry.title}' for {entry.entry_date.isoformat()} (entry_id {entry.id})."

    if kind == "journal_edit":
        entry = _load_entry(ctx, params["entry_id"])  # re-scoped: it may have been deleted since
        updated = await JournalService(ctx.db).update_entry(
            entry.id,
            JournalEntryUpdate(
                title=params.get("title"), content=params.get("content"),
                entry_type=EntryType(params["entry_type"]) if params.get("entry_type") else None,
                entry_date=date.fromisoformat(params["entry_date"]) if params.get("entry_date") else None,
            ),
            ctx.user_id,
        )
        if updated is None:
            raise ToolError("That journal entry could not be updated.")
        return f"Updated journal entry '{updated.title}'."

    if kind == "description_update":
        if params["item_type"] == "document":
            item = _load_document(ctx, params["item_id"])
            item.ai_description = params["description"]
        else:
            item = _load_recording(ctx, params["item_id"])
            item.ai_summary = params["description"]
        item.last_edited_by_user_id = ctx.user_id
        ctx.db.commit()
        return f"Updated the description of '{item.filename}'."

    if kind == "generate_digest":
        from fastapi import HTTPException
        from app.services.daily_plan_service import DailyPlanService
        try:
            plan, _created = await DailyPlanService.generate_daily_plan(
                ctx.db, ctx.session_id, user_date=params["date"], user_id=ctx.user_id,
            )
        except HTTPException as e:
            # e.g. not enough recent activity: a normal answer, not a server fault.
            detail = e.detail if isinstance(e.detail, str) else "The Daily Digest could not be generated."
            raise ToolError(detail)
        return f"The Daily Digest for {plan.date.isoformat()} is in the Digest tab."

    raise ToolError("Unknown action.")


# ---------------------------------------------------------------------------
# Health Profile suggestions (queued for on-screen review, never applied here)
# ---------------------------------------------------------------------------

async def _suggest_profile_change(ctx: ToolContext, args: dict) -> str:
    section = _str_arg(args, "section", required=True, max_len=40)
    change_type = _str_arg(args, "change_type", required=True, max_len=10)
    reasoning = _str_arg(args, "reasoning", required=True, max_len=500)
    item_id = _str_arg(args, "item_id", max_len=64)
    new_value = args.get("new_value")

    if section not in PROFILE_SECTIONS:
        raise ToolError("'section' must be one of: " + ", ".join(PROFILE_SECTIONS) + ".")
    if change_type not in ("add", "edit", "delete"):
        raise ToolError("'change_type' must be add, edit or delete.")
    if len(json.dumps(new_value, default=str)) > 4000:
        raise ToolError("'new_value' is too large.")

    from app.services.profile_service import ProfileService
    profile = await ProfileService.get_or_create_profile(ctx.db, ctx.session_id)
    data = profile.profile_data or {}
    old_value: Any = None

    if section in PROFILE_PREFERENCE_TEXT:
        # A single free-text field on the preferences object.
        if change_type == "delete":
            raise ToolError(f"To clear {section}, the person should edit it in the Health Profile screen.")
        if not isinstance(new_value, str) or not new_value.strip():
            raise ToolError(f"'new_value' must be the new text for {section}.")
        old_value = (data.get("preferences") or {}).get(section)
        stored_section, field_path, change_type, item_id = "preferences", f"preferences.{section}", "edit", None
    elif section == "patient":
        if change_type == "delete":
            raise ToolError("Patient details are edited, not deleted. Use change_type 'edit'.")
        if not isinstance(new_value, dict) or not new_value:
            raise ToolError("'new_value' must be an object of the patient fields to change.")
        old_value = {k: (data.get("patient") or {}).get(k) for k in new_value}
        stored_section, field_path, change_type, item_id = "patient", "patient", "edit", None
    else:
        is_pref_list = section in PROFILE_PREFERENCE_LISTS
        items = ((data.get("preferences") or {}).get(section) if is_pref_list else data.get(section)) or []
        stored_section = "preferences" if is_pref_list else section
        if change_type == "add":
            if not isinstance(new_value, dict) or not new_value:
                raise ToolError("'new_value' must be an object describing the new item.")
            item_id = None
            field_path = f"preferences.{section}" if is_pref_list else f"{section}.new_item"
        else:
            existing = next((i for i in items if isinstance(i, dict) and i.get("id") == item_id), None)
            if existing is None:
                raise ToolError(
                    f"No item with id '{item_id}' in {section}. Call get_health_profile for the current ids."
                )
            old_value = existing
            if change_type == "edit" and (not isinstance(new_value, dict) or not new_value):
                raise ToolError("'new_value' must be an object of the fields to change.")
            if change_type == "delete":
                new_value = None
            field_path = f"preferences.{section}" if is_pref_list else f"{section}.{item_id}"

    change = {
        "id": uuid.uuid4().hex[:8],
        "change_type": change_type,
        "field_path": field_path,
        "section": stored_section,
        "item_id": item_id,
        "old_value": old_value,
        "new_value": new_value,
        "reasoning": f"Requested in a Talk conversation: {reasoning}",
    }
    PendingChange.model_validate(change)  # a malformed row would break every profile read

    pending = list(profile.pending_changes or [])
    if len(pending) >= MAX_PENDING_PROFILE_CHANGES:
        raise ToolError(
            "There are already many Health Profile suggestions waiting for review. "
            "Ask the person to review them in the Health Profile screen first."
        )
    pending.append(change)
    profile.pending_changes = pending
    flag_modified(profile, "pending_changes")
    ctx.db.commit()
    return (
        "Suggestion added. It has NOT changed the Health Profile: tell the person it is waiting "
        "in the Health Profile screen for them to accept or reject."
    )


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

def _schema(properties: Dict[str, dict], required: Optional[List[str]] = None) -> dict:
    return {"type": "object", "properties": properties, "required": required or [], "additionalProperties": False}


_DATE = {"type": "string", "description": "A date, YYYY-MM-DD."}
_ENTRY_TYPE = {"type": "string", "enum": [t.value for t in EntryType]}

Handler = Callable[[ToolContext, dict], Awaitable[str]]

# name -> (description, input schema, handler, read_only)
TOOLS: Dict[str, tuple] = {
    "get_health_profile": (
        "The care session's Health Profile as JSON: patient, caregivers, providers, conditions, "
        "medications, allergies, history events and care preferences, with item ids.",
        _schema({}), _get_health_profile, True,
    ),
    "search_journal": (
        "Search the care journal by meaning and keywords. Use for 'when did...', 'what did the doctor say "
        "about...', or anything older than the last week.",
        _schema({"query": {"type": "string"}, "start_date": _DATE, "end_date": _DATE}, ["query"]),
        _search_journal, True,
    ),
    "get_journal_entries": (
        "All journal entries for one date or a date range (at most 31 days).",
        _schema({"start_date": _DATE, "end_date": _DATE}, ["start_date"]), _get_journal_entries, True,
    ),
    "list_documents": (
        "Uploaded documents (newest first) with ids, categories and descriptions. Optional text filter.",
        _schema({"search": {"type": "string"}}), _list_documents, True,
    ),
    "get_document_text": (
        "The extracted text of one document.",
        _schema({"document_id": {"type": "integer"}}, ["document_id"]), _get_document_text, True,
    ),
    "list_audio_recordings": (
        "Audio recordings (newest first) with ids, categories and summaries. Optional text filter.",
        _schema({"search": {"type": "string"}}), _list_audio_recordings, True,
    ),
    "get_recording_transcript": (
        "The transcript of one audio recording.",
        _schema({"recording_id": {"type": "integer"}}, ["recording_id"]), _get_recording_transcript, True,
    ),
    "get_daily_digest": (
        "The Daily Digest for a date, or the most recent one when no date is given.",
        _schema({"date": _DATE}), _get_daily_digest, True,
    ),
    "get_recent_chat": (
        "The most recent typed chat messages in this care session.",
        _schema({"limit": {"type": "integer", "minimum": 1, "maximum": 40}}), _get_recent_chat, True,
    ),
    "propose_journal_entry": (
        "Step 1 of saving a new journal entry. Saves nothing; returns an action_id and a read-back.",
        _schema(
            {"title": {"type": "string", "maxLength": 100}, "content": {"type": "string"},
             "entry_type": _ENTRY_TYPE, "entry_date": _DATE},
            ["title", "content", "entry_type"],
        ),
        _propose_journal_entry, False,
    ),
    "propose_journal_edit": (
        "Step 1 of changing an existing journal entry. Saves nothing; returns an action_id and a read-back.",
        _schema(
            {"entry_id": {"type": "integer"}, "title": {"type": "string", "maxLength": 100},
             "content": {"type": "string"}, "entry_type": _ENTRY_TYPE, "entry_date": _DATE},
            ["entry_id"],
        ),
        _propose_journal_edit, False,
    ),
    "propose_description_update": (
        "Step 1 of changing the description of a document or audio recording. Saves nothing.",
        _schema(
            {"item_type": {"type": "string", "enum": ["document", "recording"]},
             "item_id": {"type": "integer"}, "description": {"type": "string"}},
            ["item_type", "item_id", "description"],
        ),
        _propose_description_update, False,
    ),
    "propose_generate_digest": (
        "Step 1 of generating the Daily Digest for a date (default today). Saves nothing.",
        _schema({"date": _DATE}), _propose_generate_digest, False,
    ),
    "confirm_action": (
        "Step 2: apply a proposed change. Only after the person has clearly said yes, in a later turn "
        "than the proposal. The server refuses if the person has not spoken since the proposal.",
        _schema({"action_id": {"type": "string"}}, ["action_id"]), _confirm_action, False,
    ),
    "cancel_action": (
        "Discard a proposed change the person declined.",
        _schema({"action_id": {"type": "string"}}, ["action_id"]), _cancel_action, False,
    ),
    "suggest_profile_change": (
        "Queue a Health Profile change for the person to review on screen. It is never applied directly. "
        "For edit/delete of a list item give the item's id from get_health_profile. new_value is an object "
        "of fields (or text for emergency_instructions / additional_notes).",
        _schema(
            {"section": {"type": "string", "enum": list(PROFILE_SECTIONS)},
             "change_type": {"type": "string", "enum": ["add", "edit", "delete"]},
             "item_id": {"type": "string"},
             "new_value": {"description": "Object of fields, or text for the two free-text sections."},
             "reasoning": {"type": "string", "description": "What the person said that prompted this."}},
            ["section", "change_type", "reasoning"],
        ),
        _suggest_profile_change, False,
    ),
}

TOOL_NAMES = list(TOOLS)


def list_tool_definitions() -> List[dict]:
    """MCP `tools/list` payload."""
    return [
        {
            "name": name,
            "description": description,
            "inputSchema": schema,
            "annotations": {"readOnlyHint": read_only},
        }
        for name, (description, schema, _handler, read_only) in TOOLS.items()
    ]


async def call_tool(ctx: ToolContext, name: str, arguments: Any) -> str:
    """Run one tool. Raises ToolError for anything the model should be told."""
    if name not in TOOLS:
        raise ToolError(f"Unknown tool '{name}'.")
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        raise ToolError("Tool arguments must be an object.")
    handler: Handler = TOOLS[name][2]
    return await handler(ctx, arguments)
