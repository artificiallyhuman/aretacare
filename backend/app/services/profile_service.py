from openai import AsyncOpenAI
from pydantic import ValidationError
import logging
import copy
import json
import re
import uuid
import time
from types import SimpleNamespace
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime
from typing import Optional, List, Dict, Any, NamedTuple, Tuple

from ..schemas.profile import PendingChange, ProfileData
from ..models.profile import Profile
from ..models.conversation import Conversation
from ..models.journal import JournalEntry
from ..models.session import Session as UserSession
from ..models.user import User
from ..models.session_collaborator import SessionCollaborator
from ..core.config import settings
from ..config import ai_config
from .openai_service import guarded_responses_create, wrap_untrusted, _strip_markdown_images

logger = logging.getLogger(__name__)

def _profile_system_messages() -> List[Dict[str, str]]:
    """System messages for every profile generation call.

    The profile is built from chat turns and journal entries, which in turn come from
    uploads and from every participant in the care session. Those are passed wrapped,
    so each call carries the rule that wrapped content is data, plus the shared safety
    boundaries.
    """
    return [
        {"role": "system", "content": ai_config.GENERATION_SAFETY_PREAMBLE},
        {"role": "system", "content": ai_config.UNTRUSTED_CONTENT_NOTICE},
        {"role": "system", "content": ai_config.PROFILE_SYSTEM_PROMPT},
    ]


def _strip_images_deep(value: Any) -> Any:
    """Apply _strip_markdown_images to every string inside a JSON-like structure.

    Profile text is rendered as markdown by the clients, and here the model returns
    JSON rather than a single string, so the stripping has to walk the structure.
    """
    if isinstance(value, str):
        return _strip_markdown_images(value)
    if isinstance(value, list):
        return [_strip_images_deep(item) for item in value]
    if isinstance(value, dict):
        return {key: _strip_images_deep(item) for key, item in value.items()}
    return value


# Preferences sub-fields that are nested arrays (vs scalar fields like emergency_instructions)
PREFERENCES_ARRAY_FIELDS = {"communication_preferences", "caregiving_guidelines", "important_context"}
PREFERENCES_ID_PREFIXES = {
    "communication_preferences": "comm",
    "caregiving_guidelines": "guide",
    "important_context": "ctx",
}
# The field that identifies an item to a person. Used to recognise that a pending
# AI "add" has been made redundant by an item the user added by hand.
PRIMARY_FIELDS = {
    "caregivers": "name",
    "providers": "name",
    "medications": "name",
    "conditions": "clinical_term",
    "allergies": "substance",
    "events": "description",
    "communication_preferences": "preference",
    "caregiving_guidelines": "guideline",
    "important_context": "context",
}

# How much of the review list a profile update shows the model (newest first kept).
MAX_PENDING_IN_PROMPT_CHARS = 20_000


def _loose(value: Any) -> str:
    """Text compared loosely: case, spacing and punctuation ignored."""
    if not isinstance(value, str):
        return ""
    return " ".join(re.sub(r"[^\w\s]", " ", value).split()).casefold()


def _one_edit_apart(a: str, b: str) -> bool:
    """True when one letter added, dropped or changed turns `a` into `b`."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    return a[i + 1:] == b[i + 1:] if len(a) == len(b) else a[i:] == b[i + 1:]


def _same_person_name(a: str, b: str) -> bool:
    """Two loose names for one person, the way a name heard in a Talk call or a recording
    comes out next to a typed one: one adds a surname ("Priya" / "Priya Shah"), or the first
    names differ by one letter and the shorter has at least four ("Priya" / "Preya")."""
    ta, tb = a.split(), b.split()
    if not ta or not tb:
        return False
    short, longer = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    if longer[:len(short)] == short:
        return True
    if ta[1:] and tb[1:] and ta[1:] != tb[1:]:
        return False
    return min(len(ta[0]), len(tb[0])) >= 4 and _one_edit_apart(ta[0], tb[0])


# Lists whose items are named things (a person, a drug, a diagnosis, a substance). The rest
# (events, and the three preferences lists) are free text and match only word for word.
NAMED_LISTS = {"caregivers", "providers", "medications", "conditions", "allergies"}
_PARENTHESES = re.compile(r"\(([^()]*)\)")
# A strength written into a medication's name ("600 mg", "5/325 mg", "1,000 IU"). Only with a
# unit: a bare number can be part of the name ("Tylenol #3" is not Tylenol).
_STRENGTH = re.compile(
    r"(?<![\w.])\d+(?:[.,/]\d+)*\s*(?:mg|mcg|µg|ug|g|ml|units?|iu|meq|mmol|%)(?!\w)", re.IGNORECASE)
# Words for how a medication is made, not which one it is ("Metformin ER tablet"). Inhalers,
# patches, creams and injections are left out: one drug can be prescribed in two of those.
_MEDICATION_FORM_WORDS = {"tablet", "tablets", "tab", "tabs", "capsule", "capsules", "cap", "caps", "oral",
                          "er", "xr", "sr", "xl", "cr", "dr", "ir"}
# Credentials after a provider's name. After a comma all of them count ("Avery Patel, MD,
# PhD"); without one only those that can't be a surname (Do, Pa and Od can).
_CREDENTIALS = {"md", "do", "np", "pa", "pa-c", "rn", "aprn", "fnp", "fnp-c", "dnp", "phd", "pharmd",
                "dds", "dmd", "dpm", "od", "mph", "facs", "facc"}
_TRAILING_CREDENTIALS = {"md", "np", "rn", "aprn", "fnp", "dnp", "phd", "pharmd", "dds", "dmd", "dpm"}


def _name_key(list_name: str, text: str) -> str:
    """One name, compared loosely, without what doesn't tell two items apart."""
    if list_name == "medications":
        text = _STRENGTH.sub(" ", text)
    if list_name == "providers" and "," in text:
        head, tail = text.split(",", 1)
        tail_words = [w for w in re.split(r"[\s,]+", tail.lower().replace(".", "")) if w]
        if tail_words and all(w in _CREDENTIALS for w in tail_words):
            text = head
    words = _loose(text).split()
    if list_name == "medications":
        words = [w for w in words if w not in _MEDICATION_FORM_WORDS]
    elif list_name == "providers":
        while words and words[0] in ("dr", "doctor"):
            words = words[1:]
        while len(words) > 1 and words[-1] in _TRAILING_CREDENTIALS:
            words = words[:-1]
    return " ".join(words)


def _name_keys(list_name: str, value: Any) -> Tuple[str, set]:
    """A name as compared for repeats: the name outside parentheses, and what they hold
    ("Acetaminophen (Tylenol)" is acetaminophen and {tylenol})."""
    if not isinstance(value, str):
        return "", set()
    inner = {_name_key(list_name, part) for part in _PARENTHESES.findall(value)} - {""}
    return _name_key(list_name, _PARENTHESES.sub(" ", value)), inner


_EMPTY = (None, "", [], {})


class Screened(NamedTuple):
    """What to do with a new profile suggestion (ProfileService.screen_suggestion)."""
    action: str                      # "queue" or "skip"
    change: Optional[Dict] = None    # what to queue (possibly rewritten)
    replaces: Optional[Dict] = None  # a waiting suggestion it takes the place of
    reason: Optional[str] = None     # why skipped: "in_profile", "waiting" or "no_change"
    match: Optional[Dict] = None     # the profile item an add turned out to repeat

# Initialize OpenAI client. SDK retries off: one call is one bounded HTTP
# attempt, so a degraded API can't stretch a request to timeout × 3.
client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    timeout=settings.OPENAI_SYNTHESIS_TIMEOUT_SECONDS,
    max_retries=0,
)

# Token budget for profile generation. gpt-5.6-sol's context window is 1.05M tokens,
# but requests above 272K input tokens are billed at 2x input / 1.5x output —
# keep this budget under that threshold.
MAX_PROFILE_TOKENS = 230000  # Leave headroom for response + overhead below the 272K pricing tier
ESTIMATED_EXISTING_PROFILE_TOKENS = 30000  # Reserve for existing profile JSON in updates
ESTIMATED_SYSTEM_PROMPT_TOKENS = 10000  # Reserve for system + user prompt templates


def _estimate_tokens(text: str) -> int:
    """Estimate token count from text (roughly 4 chars per token for English)"""
    if not text:
        return 0
    return len(text) // 4


async def _log_profile_api_call(
    feature: str,
    response,
    start_time: float,
    success: bool,
    user_id: Optional[str] = None,
    error_message: Optional[str] = None
):
    """Log an API call from profile service"""
    try:
        from app.services.openai_service import log_api_call

        input_tokens = 0
        output_tokens = 0
        model = ai_config.CHAT_MODEL

        if success and response and hasattr(response, "usage") and response.usage:
            input_tokens = getattr(response.usage, "input_tokens", 0) or 0
            output_tokens = getattr(response.usage, "output_tokens", 0) or 0

        response_time_ms = int((time.time() - start_time) * 1000)

        await log_api_call(
            feature=feature,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            success=success,
            model=model,
            response_time_ms=response_time_ms,
            user_id=user_id,
            error_message=error_message
        )
    except Exception as e:
        logger.error(f"Failed to log profile API call: {e}")


class ProfileService:
    """Service for managing AI-powered profile generation and updates"""

    @staticmethod
    async def get_or_create_profile(
        db: Session,
        session_id: str
    ) -> Profile:
        """
        Get existing profile or create a new one for the session.

        Args:
            db: Database session
            session_id: The session ID

        Returns:
            Profile: The existing or newly created profile
        """
        # Check for existing profile
        profile = db.query(Profile).filter(Profile.session_id == session_id).first()

        if profile:
            return profile

        # Get current max IDs so we don't count existing data as "new"
        from sqlalchemy import func
        max_conv_id = db.query(func.max(Conversation.id)).filter(
            Conversation.session_id == session_id
        ).scalar()
        max_journal_id = db.query(func.max(JournalEntry.id)).filter(
            JournalEntry.session_id == session_id
        ).scalar()

        # Create new profile with empty data
        profile = Profile(
            session_id=session_id,
            profile_data={
                "patient": None,
                "caregivers": [],
                "providers": [],
                "conditions": [],
                "medications": [],
                "allergies": [],
                "events": [],
                "preferences": None
            },
            pending_changes=[],
            last_processed_conversation_id=max_conv_id,
            last_processed_journal_id=max_journal_id
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

        return profile

    @staticmethod
    async def update_profile_from_activity(
        db: Session,
        session_id: str,
        user_id: Optional[str] = None
    ) -> Tuple[Profile, bool]:
        """
        Update profile based on new activity (conversations, journal entries).

        This method:
        1. Gets new activity since last profile update
        2. Uses AI to determine additions and changes
        3. Applies additions directly
        4. Adds proposed changes to pending_changes for user approval

        Args:
            db: Database session
            session_id: The session ID
            user_id: Optional user ID for API logging

        Returns:
            Tuple[Profile, bool]: The updated profile and whether any updates were made
        """
        try:
            # Get or create profile
            profile = await ProfileService.get_or_create_profile(db, session_id)

            # Check if this is an initial profile (empty) - needed for token budget calculation
            is_initial = ProfileService._is_profile_empty(profile.profile_data)

            # Gather new activity since last update (uses more tokens for initial generation)
            new_activity = await ProfileService._gather_new_activity(db, session_id, profile, is_initial=is_initial)

            if not new_activity:
                logger.info(f"No new activity for profile update in session {session_id}")
                return profile, False

            if is_initial:
                # Generate initial profile from all available data
                updated_profile = await ProfileService._generate_initial_profile(
                    db, profile, new_activity, user_id=user_id
                )
            else:
                # Update existing profile with new activity
                updated_profile = await ProfileService._update_existing_profile(
                    db, profile, new_activity, user_id=user_id
                )

            return updated_profile, True

        except Exception as e:
            logger.error(f"Error updating profile: {str(e)}", exc_info=True)
            db.rollback()
            raise

    @staticmethod
    async def _gather_new_activity(
        db: Session,
        session_id: str,
        profile: Profile,
        is_initial: bool = False
    ) -> Dict:
        """
        Gather new conversations and journal entries since last profile update.

        Uses token-based truncation to maximize context usage:
        - Prioritizes journal entries (more structured, higher signal)
        - Fills remaining budget with conversations
        - For updates, reserves tokens for existing profile JSON
        """

        activity = {
            "conversations": [],
            "journal_entries": [],
            "session_info": {}
        }

        # Calculate available token budget
        # For updates, reserve space for existing profile; for initial, use full budget
        reserved_tokens = ESTIMATED_SYSTEM_PROMPT_TOKENS
        if not is_initial:
            reserved_tokens += ESTIMATED_EXISTING_PROFILE_TOKENS

        available_tokens = MAX_PROFILE_TOKENS - reserved_tokens
        total_tokens = 0

        # Get session info including owner and collaborators (small, always include)
        session = db.query(UserSession).filter(UserSession.id == session_id).first()
        if session:
            owner = db.query(User).filter(User.id == session.owner_id).first()
            if owner:
                activity["session_info"]["owner"] = {
                    "name": owner.name,
                    "email": owner.email
                }

            # Get collaborators - single query to avoid N+1
            collaborators = db.query(SessionCollaborator).filter(
                SessionCollaborator.session_id == session_id
            ).all()

            activity["session_info"]["collaborators"] = []
            if collaborators:
                # Fetch all collaborator users in one query
                collaborator_user_ids = [c.user_id for c in collaborators]
                collaborator_users = db.query(User).filter(
                    User.id.in_(collaborator_user_ids)
                ).all()
                user_map = {u.id: u for u in collaborator_users}

                for collab in collaborators:
                    user = user_map.get(collab.user_id)
                    if user:
                        activity["session_info"]["collaborators"].append({
                            "name": user.name,
                            "email": user.email
                        })

        # Estimate tokens for session info
        session_info_text = json.dumps(activity["session_info"])
        total_tokens += _estimate_tokens(session_info_text)

        # PRIORITY 1: Get journal entries (higher signal, more structured)
        journal_query = db.query(JournalEntry).filter(
            JournalEntry.session_id == session_id
        )

        # For initial profile generation, get ALL data (ignore last_processed filter)
        if not is_initial and profile.last_processed_journal_id:
            journal_query = journal_query.filter(
                JournalEntry.id > profile.last_processed_journal_id
            )

        # Stream in batches rather than .all(): the loop below stops at the token
        # budget, and materialising a long session's every entry just to use the
        # first slice of it pulled the whole history into memory.
        journal_entries = journal_query.order_by(JournalEntry.created_at.asc()).yield_per(200)

        last_journal_id = None
        for entry in journal_entries:
            entry_data = {
                "title": entry.title,
                "content": entry.content,  # Full content, no truncation
                "entry_type": entry.entry_type.value if hasattr(entry.entry_type, 'value') else str(entry.entry_type),
                "entry_date": entry.entry_date.isoformat() if entry.entry_date else None
            }

            # Estimate tokens for this entry
            entry_text = f"{entry_data['title']} {entry_data['content']} {entry_data['entry_type']} {entry_data['entry_date']}"
            entry_tokens = _estimate_tokens(entry_text)

            # Check if adding this entry would exceed budget
            if total_tokens + entry_tokens > available_tokens:
                break

            activity["journal_entries"].append(entry_data)
            total_tokens += entry_tokens
            last_journal_id = entry.id

        # Update last processed journal ID
        if last_journal_id:
            profile.last_processed_journal_id = last_journal_id

        # PRIORITY 2: Fill remaining budget with conversations
        remaining_tokens = available_tokens - total_tokens

        if remaining_tokens > 1000:  # Only add conversations if we have meaningful space
            conv_query = db.query(Conversation).filter(
                Conversation.session_id == session_id
            )

            # For initial profile generation, get ALL data (ignore last_processed filter)
            if not is_initial and profile.last_processed_conversation_id:
                conv_query = conv_query.filter(
                    Conversation.id > profile.last_processed_conversation_id
                )

            # Streamed for the same reason as the journal query above
            conversations = conv_query.order_by(Conversation.created_at.asc()).yield_per(200)

            last_conv_id = None
            for conv in conversations:
                conv_data = {
                    "role": conv.role.value if hasattr(conv.role, 'value') else str(conv.role),
                    "content": conv.content,  # Full content, no truncation
                    "timestamp": conv.created_at.isoformat()
                }

                # Estimate tokens for this conversation
                conv_text = f"{conv_data['role']} {conv_data['content']} {conv_data['timestamp']}"
                conv_tokens = _estimate_tokens(conv_text)

                # Check if adding this would exceed budget
                if total_tokens + conv_tokens > available_tokens:
                    break

                activity["conversations"].append(conv_data)
                total_tokens += conv_tokens
                last_conv_id = conv.id

            # Update last processed conversation ID
            if last_conv_id:
                profile.last_processed_conversation_id = last_conv_id

        # For initial profile generation, set last_processed IDs to MAX in session
        # This ensures all existing data is marked as "seen" even if it didn't fit in budget
        if is_initial:
            from sqlalchemy import func
            max_conv_id = db.query(func.max(Conversation.id)).filter(
                Conversation.session_id == session_id
            ).scalar()
            max_journal_id = db.query(func.max(JournalEntry.id)).filter(
                JournalEntry.session_id == session_id
            ).scalar()
            if max_conv_id:
                profile.last_processed_conversation_id = max_conv_id
            if max_journal_id:
                profile.last_processed_journal_id = max_journal_id

        # Return None if no new activity
        if not activity["conversations"] and not activity["journal_entries"]:
            return None

        return activity

    @staticmethod
    def _is_profile_empty(profile_data: Dict) -> bool:
        """Check if profile data is essentially empty"""
        if not profile_data:
            return True

        # Check if any section has meaningful data
        if profile_data.get("patient"):
            return False
        if profile_data.get("caregivers") and len(profile_data["caregivers"]) > 0:
            return False
        if profile_data.get("providers") and len(profile_data["providers"]) > 0:
            return False
        if profile_data.get("conditions") and len(profile_data["conditions"]) > 0:
            return False
        if profile_data.get("medications") and len(profile_data["medications"]) > 0:
            return False
        if profile_data.get("allergies") and len(profile_data["allergies"]) > 0:
            return False
        if profile_data.get("events") and len(profile_data["events"]) > 0:
            return False
        if profile_data.get("preferences"):
            return False

        return True

    @staticmethod
    async def _generate_initial_profile(
        db: Session,
        profile: Profile,
        activity: Dict,
        user_id: Optional[str] = None
    ) -> Profile:
        """Generate initial profile from historical data"""
        start_time = time.time()
        response = None
        try:
            # Format historical data for the prompt
            historical_data = ProfileService._format_activity_for_prompt(activity)

            # Build the prompt
            user_prompt = ai_config.PROFILE_INITIAL_PROMPT.format(
                historical_data=wrap_untrusted(historical_data, source="care_session_history")
            )

            # Call OpenAI
            response = await guarded_responses_create(
                client,
                model=ai_config.CHAT_MODEL,
                input=_profile_system_messages() + [
                    {"role": "user", "content": user_prompt}
                ]
            )

            # Extract response text
            text = getattr(response, "output_text", None)
            if text is None and getattr(response, "output", None):
                first_item = response.output[0]
                if getattr(first_item, "content", None):
                    first_content = first_item.content[0]
                    text = getattr(first_content, "text", None)

            if not text:
                raise Exception("No response from AI for initial profile")

            # Log successful API call
            await _log_profile_api_call("profile_initial", response, start_time, True, user_id)

            # Parse JSON response
            profile_data = _strip_images_deep(ProfileService._parse_json_response(text))

            # This write goes straight into the stored profile with no review step,
            # and every profile read validates against ProfileData. Output that does
            # not fit the schema is rejected here, so a malformed generation fails this
            # one request instead of breaking every later read of the profile.
            if not isinstance(profile_data, dict):
                raise ValueError("AI profile output was not a JSON object")
            # Written in one go with no review, so the duplicate rule applies here too.
            ProfileService._collapse_repeats(profile_data)
            try:
                ProfileData.model_validate(profile_data)
            except ValidationError as e:
                logger.warning(
                    f"Rejecting malformed AI profile for session {profile.session_id}: "
                    f"{[(err.get('loc'), err.get('type')) for err in e.errors()[:5]]}"
                )
                raise ValueError("AI profile output did not match the profile schema")

            # Update profile
            profile.profile_data = profile_data
            profile.last_ai_update = datetime.utcnow()
            profile.updated_at = datetime.utcnow()

            db.commit()
            db.refresh(profile)

            logger.info(f"Generated initial profile for session {profile.session_id}")
            return profile

        except Exception as e:
            # Log failed API call
            await _log_profile_api_call("profile_initial", response, start_time, False, user_id, str(e))
            logger.error(f"Error generating initial profile: {str(e)}", exc_info=True)
            db.rollback()
            raise

    @staticmethod
    async def _update_existing_profile(
        db: Session,
        profile: Profile,
        activity: Dict,
        user_id: Optional[str] = None
    ) -> Profile:
        """Update existing profile with new activity"""
        start_time = time.time()
        response = None
        try:
            # Format data for the prompt
            existing_profile = json.dumps(profile.profile_data, indent=2)
            new_activity = ProfileService._format_activity_for_prompt(activity)
            # Suggestions not yet accepted aren't in the profile. Without them the model
            # suggested the same person again from the next mention (a caregiver added twice).
            waiting = ProfileService._pending_for_prompt(profile.pending_changes)

            # Build the prompt
            user_prompt = ai_config.PROFILE_UPDATE_PROMPT.format(
                existing_profile=wrap_untrusted(existing_profile, source="existing_profile"),
                pending_changes=wrap_untrusted(waiting, source="pending_suggestions"),
                new_activity=wrap_untrusted(new_activity, source="new_activity")
            )

            # Call OpenAI
            response = await guarded_responses_create(
                client,
                model=ai_config.CHAT_MODEL,
                input=_profile_system_messages() + [
                    {"role": "user", "content": user_prompt}
                ]
            )

            # Extract response text
            text = getattr(response, "output_text", None)
            if text is None and getattr(response, "output", None):
                first_item = response.output[0]
                if getattr(first_item, "content", None):
                    first_content = first_item.content[0]
                    text = getattr(first_content, "text", None)

            if not text:
                raise Exception("No response from AI for profile update")

            # Log successful API call
            await _log_profile_api_call("profile_update", response, start_time, True, user_id)

            # Parse JSON response
            update_data = _strip_images_deep(ProfileService._parse_json_response(text))
            if not isinstance(update_data, dict):
                raise ValueError("AI profile update output was not a JSON object")

            # ALL changes require approval - AI returns unified list of suggested changes.
            # Re-read the list under a row lock: Talk suggestions, the review screen and
            # manual edits rewrite it too, and the model call above can take minutes.
            # profile_data is re-read too (never written here), for the duplicate check.
            db.refresh(profile, attribute_names=["pending_changes", "profile_data"], with_for_update=True)
            pending = list(profile.pending_changes or [])

            # Process all suggested changes from AI
            changes = update_data.get("changes", [])
            for change in changes:
                # Assign unique ID if not present
                if not change.get("id"):
                    change["id"] = str(uuid.uuid4())[:8]

                # Normalize preferences sub-array changes
                section = change.get("section", "")
                item_id = change.get("item_id")

                if section in PREFERENCES_ARRAY_FIELDS:
                    # AI used sub-array name as section — normalize
                    change["field_path"] = f"preferences.{section}"
                    change["section"] = "preferences"
                    section = "preferences"
                elif section.startswith("preferences."):
                    # AI used "preferences.communication_preferences" as section
                    sub = section.split(".", 1)[1]
                    if sub in PREFERENCES_ARRAY_FIELDS:
                        change["field_path"] = section
                        change["section"] = "preferences"
                        section = "preferences"

                # Ensure field_path is set
                if not change.get("field_path"):
                    if item_id:
                        change["field_path"] = f"{section}.{item_id}"
                    else:
                        change["field_path"] = f"{section}.new_item"

                # Nothing enforces the prompt's shape on the model output, but the
                # response schema is strict — one malformed change committed here
                # (e.g. change_type "update", or a missing reasoning) would make
                # every profile read for this session 500 with no way to reject it.
                try:
                    PendingChange.model_validate(change)
                except ValidationError as e:
                    logger.warning(
                        f"Dropping malformed AI pending change for session {profile.session_id}: "
                        f"{e.errors()[:3]} in {change!r:.500}"
                    )
                    continue

                # The prompt says not to repeat what's there or waiting, but nothing made the
                # model follow it: a repeat becomes an update carrying only what's new, joins
                # the suggestion already waiting, or is dropped (see screen_suggestion).
                screened = ProfileService.screen_suggestion(profile.profile_data, pending, change)
                if screened.action == "skip":
                    logger.info(f"Skipped a repeated AI suggestion for session {profile.session_id} ({screened.reason})")
                    continue
                if screened.replaces is not None:
                    pending = [c for c in pending if c is not screened.replaces]
                pending.append(screened.change)

            profile.pending_changes = pending

            # Only update timestamps if there are no pending changes (means profile is up to date)
            # or if we actually modified profile_data. Don't update just for generating pending changes.
            profile.updated_at = datetime.utcnow()

            # Only the pending list changed. profile_data is NOT flagged: this copy was read
            # before the model call, and writing it back would undo a manual edit made
            # in the meantime.
            flag_modified(profile, "pending_changes")

            db.commit()
            db.refresh(profile)

            logger.info(f"Updated profile for session {profile.session_id}: {len(changes)} pending changes")
            return profile

        except Exception as e:
            # Log failed API call
            await _log_profile_api_call("profile_update", response, start_time, False, user_id, str(e))
            logger.error(f"Error updating existing profile: {str(e)}", exc_info=True)
            db.rollback()
            raise

    @staticmethod
    def _format_activity_for_prompt(activity: Dict) -> str:
        """Format activity data for AI prompt"""
        parts = []

        # Session info - use neutral terms, let AI infer roles from content
        if activity.get("session_info"):
            info = activity["session_info"]
            parts.append("## Session Users")
            parts.append("(Note: Determine each person's role - patient, caregiver, family member - from conversation content, not from their session role)")
            if info.get("owner"):
                parts.append(f"Session creator: {info['owner']['name']} ({info['owner']['email']})")
            if info.get("collaborators"):
                parts.append("Other users with access:")
                for collab in info["collaborators"]:
                    parts.append(f"  - {collab['name']} ({collab['email']})")

        # Conversations
        if activity.get("conversations"):
            parts.append("\n## Conversations")
            for conv in activity["conversations"]:
                parts.append(f"[{conv['timestamp']}] {conv['role'].upper()}: {conv['content']}")

        # Journal entries
        if activity.get("journal_entries"):
            parts.append("\n## Journal Entries")
            for entry in activity["journal_entries"]:
                parts.append(f"### {entry['title']} ({entry['entry_type']}) - {entry['entry_date']}")
                parts.append(entry['content'])

        return "\n".join(parts)

    @staticmethod
    def _parse_json_response(text: str) -> Dict:
        """Parse JSON from AI response, handling potential formatting issues"""
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        import re
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if json_match:
            try:
                return json.loads(json_match.group(1).strip())
            except json.JSONDecodeError:
                pass

        # Try to find JSON object in the text
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        if start_idx != -1 and end_idx != -1:
            try:
                return json.loads(text[start_idx:end_idx + 1])
            except json.JSONDecodeError:
                pass

        logger.error(f"Failed to parse JSON from AI response: {text[:500]}")
        raise ValueError("Could not parse JSON from AI response")

    @staticmethod
    async def apply_pending_changes(
        db: Session,
        profile: Profile,
        decisions: Dict[str, Any]
    ) -> Profile:
        """
        Apply user decisions on pending changes.

        Args:
            db: Database session
            profile: The profile to update
            decisions: Dict mapping change_id to decision:
                       - "accept": Apply the change as-is
                       - "reject": Discard the change
                       - Any other value: Use as the new value (user edited)

        Returns:
            Profile: The updated profile
        """
        try:
            # Lock the row and re-read it: a Talk suggestion or another reviewer may have
            # changed the list since the route loaded the profile, and writing back a stale
            # list would erase their change.
            db.refresh(profile, with_for_update=True)
            pending_changes = profile.pending_changes or []
            remaining_changes = []
            changes_applied = 0

            for change in pending_changes:
                change_id = change.get("id")
                decision = decisions.get(change_id)

                if decision is None:
                    # No decision made, keep in pending
                    remaining_changes.append(change)
                    continue

                if decision == "reject":
                    # User rejected, discard the change
                    continue

                # User accepted (possibly with edits)
                if decision == "accept":
                    value_to_apply = change.get("new_value")
                else:
                    # User provided edited value
                    value_to_apply = decision

                # A null value on anything but a delete is the AI's "unknown"
                # placeholder (the dict path filters per-key nulls the same way in
                # _apply_list_change). Applying it would erase a stored value the
                # user typed — discard the change instead.
                if value_to_apply is None and change.get("change_type") != "delete":
                    continue

                # Every profile read validates against ProfileData, so one value of the
                # wrong type (an integer age from a voice suggestion, a malformed AI change,
                # an edited value) would make the whole profile unreadable. Check the
                # result first; a change that fails is dropped, like a malformed AI one.
                try:
                    ProfileData.model_validate(ProfileService.preview_change(
                        profile.profile_data, {**change, "new_value": value_to_apply}
                    ))
                except ValidationError as e:
                    # Locations and error types only: the values are health data.
                    logger.warning(
                        f"Dropping pending change {change_id} for session {profile.session_id}: "
                        f"it would make the profile invalid {[(err['loc'], err['type']) for err in e.errors()[:3]]}"
                    )
                    continue

                # Accepting an add of something the profile already has (two suggestions for
                # one item, or one added since) updates that item instead of adding it again.
                # "Accept all" used to add a caregiver, and a medication, twice.
                repeat = ProfileService._accepted_repeat(profile.profile_data, change, value_to_apply)
                if repeat is not None:
                    existing, fields = repeat
                    if fields:
                        existing.update(fields)
                        changes_applied += 1
                    continue

                # Apply the change
                ProfileService._apply_change(
                    profile,
                    change.get("change_type"),
                    change.get("section"),
                    change.get("item_id"),
                    change.get("field_path"),
                    value_to_apply
                )
                changes_applied += 1

            profile.pending_changes = remaining_changes

            # Only update timestamps if changes were actually applied
            if changes_applied > 0:
                profile.last_ai_update = datetime.utcnow()
                profile.last_user_update = datetime.utcnow()
                profile.updated_at = datetime.utcnow()

            # Explicitly flag JSONB columns as modified for SQLAlchemy to detect changes
            flag_modified(profile, "profile_data")
            flag_modified(profile, "pending_changes")

            db.commit()
            db.refresh(profile)

            return profile

        except Exception as e:
            logger.error(f"Error applying pending changes: {str(e)}", exc_info=True)
            db.rollback()
            raise

    @staticmethod
    def preview_change(profile_data: Optional[Dict], change: Dict) -> Dict:
        """The profile data as it would be after `change`, leaving the stored profile and
        the change untouched. Validate the result against ProfileData before a change is
        queued or applied."""
        stand_in = SimpleNamespace(profile_data=copy.deepcopy(profile_data or {}))
        ProfileService._apply_change(
            stand_in,
            change.get("change_type"),
            change.get("section"),
            change.get("item_id"),
            change.get("field_path"),
            copy.deepcopy(change.get("new_value")),  # an add stamps an id into it
        )
        return stand_in.profile_data

    @staticmethod
    def _apply_list_change(
        items: list,
        change_type: str,
        item_id: Optional[str],
        field_path: str,
        new_value: Any,
        id_prefix: str
    ):
        """Apply add/edit/delete to a list of items. Shared by top-level lists and preferences sub-arrays."""
        if change_type == "add":
            if isinstance(new_value, dict):
                if "id" not in new_value:
                    new_value["id"] = f"{id_prefix}_{uuid.uuid4().hex[:6]}"
                items.append(new_value)
        elif change_type == "delete":
            items[:] = [item for item in items if item.get("id") != item_id]
        elif change_type == "edit":
            for item in items:
                if item.get("id") == item_id:
                    if isinstance(new_value, dict):
                        original_id = item.get("id")
                        # A null in an AI-proposed value means "unknown", not "clear"
                        # (the update prompt's own example carries nulls for fields it
                        # has no information about). Never let one erase a value the
                        # user entered by hand. Removing a whole item is change_type
                        # "delete"; removing a single field is not something the AI
                        # proposes.
                        for key, value in new_value.items():
                            if key != "id" and value is not None:
                                item[key] = value
                        if original_id:
                            item["id"] = original_id
                    else:
                        field_name = field_path.split(".")[-1]
                        item[field_name] = new_value
                    break

    @staticmethod
    def _resolve_preferences_sub_array(section, field_path, change_type, new_value):
        """
        Determine if a change targets a preferences sub-array.
        Returns the sub-array name if so, None otherwise.
        """
        # Already using the sub-array name as section (AI variant format)
        if section in PREFERENCES_ARRAY_FIELDS:
            return section

        # Section is "preferences" — check field_path for sub-array name
        if section == "preferences" and field_path:
            sub = field_path.split(".")[-1]
            if sub in PREFERENCES_ARRAY_FIELDS:
                return sub

        # Section is "preferences" with no useful field_path — infer from new_value
        if section == "preferences" and change_type in ("add", "edit") and isinstance(new_value, dict):
            if "preference" in new_value:
                return "communication_preferences"
            if "guideline" in new_value:
                return "caregiving_guidelines"
            if "context" in new_value:
                return "important_context"
            # Handle wrapped format: {"communication_preferences": [{...}]}
            for key in PREFERENCES_ARRAY_FIELDS:
                if key in new_value and isinstance(new_value[key], list):
                    return key

        return None

    @staticmethod
    def _apply_change(
        profile: Profile,
        change_type: str,
        section: str,
        item_id: Optional[str],
        field_path: str,
        new_value: Any
    ):
        """Apply a single change to the profile"""
        profile_data = profile.profile_data or {}

        # Check if this targets a preferences sub-array
        sub_array = ProfileService._resolve_preferences_sub_array(
            section, field_path, change_type, new_value
        )

        if sub_array:
            # Preferences sub-array — route through shared list logic
            if not profile_data.get("preferences"):
                profile_data["preferences"] = {}
            if sub_array not in profile_data["preferences"]:
                profile_data["preferences"][sub_array] = []

            # Unwrap if AI wrapped new_value in the array key
            if isinstance(new_value, dict) and sub_array in new_value and isinstance(new_value[sub_array], list):
                new_value = new_value[sub_array][0] if new_value[sub_array] else new_value

            prefix = PREFERENCES_ID_PREFIXES.get(sub_array, "pref")
            ProfileService._apply_list_change(
                profile_data["preferences"][sub_array],
                change_type, item_id, field_path, new_value, prefix
            )

        elif section in ("patient", "preferences"):
            # Single-object section (patient fields or preferences scalars)
            if not profile_data.get(section):
                profile_data[section] = {}
            if change_type in ("add", "edit"):
                if isinstance(new_value, dict):
                    # Nulls are "unknown", not "clear" — see _apply_list_change.
                    profile_data[section].update(
                        {k: v for k, v in new_value.items() if v is not None}
                    )
                else:
                    field_name = field_path.split(".")[-1] if field_path else section
                    profile_data[section][field_name] = new_value
            elif change_type == "delete":
                field_name = field_path.split(".")[-1] if field_path else None
                if field_name and field_name in profile_data[section]:
                    del profile_data[section][field_name]

        else:
            # Top-level list section (caregivers, medications, etc.)
            if section not in profile_data:
                profile_data[section] = []
            ProfileService._apply_list_change(
                profile_data[section],
                change_type, item_id, field_path, new_value,
                section[:3]
            )

        profile.profile_data = profile_data

    @staticmethod
    async def regenerate_profile(
        db: Session,
        session_id: str,
        user_id: Optional[str] = None
    ) -> Profile:
        """
        Regenerate the profile from scratch using all available data.

        This deletes the existing profile and creates a new one.
        """
        # Delete existing profile if any
        existing = db.query(Profile).filter(Profile.session_id == session_id).first()
        if existing:
            db.delete(existing)
            db.commit()

        # Create new profile
        profile = Profile(
            session_id=session_id,
            profile_data={
                "patient": None,
                "caregivers": [],
                "providers": [],
                "conditions": [],
                "medications": [],
                "allergies": [],
                "events": [],
                "preferences": None
            },
            pending_changes=[],
            last_processed_conversation_id=None,
            last_processed_journal_id=None
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

        # Now update with all available activity
        profile, _ = await ProfileService.update_profile_from_activity(db, session_id, user_id=user_id)

        return profile

    @staticmethod
    def update_profile_manually(
        db: Session,
        profile: Profile,
        profile_data: Dict
    ) -> Profile:
        """
        Update profile with user-provided data (manual edit).

        Args:
            db: Database session
            profile: The profile to update
            profile_data: The new profile data

        Returns:
            Profile: The updated profile
        """
        # Lock the row and re-read the pending list before reconciling it below, so a
        # suggestion added since the route loaded the profile isn't written over.
        db.refresh(profile, attribute_names=["pending_changes"], with_for_update=True)
        profile.profile_data = profile_data
        profile.last_user_update = datetime.utcnow()
        profile.updated_at = datetime.utcnow()

        # Explicitly flag JSONB column as modified for SQLAlchemy to detect changes
        flag_modified(profile, "profile_data")

        # The pending AI suggestions were generated against the profile as it was
        # before this edit. Re-check them so the review screen shows true "current"
        # values and accepting one cannot undo what the user just typed.
        if profile.pending_changes:
            profile.pending_changes = ProfileService._reconcile_pending_changes(
                profile_data, profile.pending_changes
            )
            flag_modified(profile, "pending_changes")

        db.commit()
        db.refresh(profile)

        return profile

    # ------------------------------------------------------------------
    # Pending-change reconciliation after a manual edit
    # ------------------------------------------------------------------

    @staticmethod
    def _reconcile_pending_changes(profile_data: Dict, pending_changes: List[Dict]) -> List[Dict]:
        """Re-check AI-proposed changes against profile data the user just edited by hand.

        For each change:
        - its target item/field no longer exists        -> dropped (nothing left to change)
        - the proposed values already equal the profile -> dropped (the user did it by hand)
        - an "add" duplicates an item that now exists   -> dropped
        - otherwise                                     -> kept, with ``old_value`` refreshed
          to the current data so the review diff is truthful
        A change that cannot be interpreted is kept untouched; reconciliation must
        never lose a suggestion it does not understand.
        """
        reconciled: List[Dict] = []
        for change in pending_changes or []:
            try:
                kept = ProfileService._reconcile_one(profile_data or {}, change)
            except Exception as e:  # defensive: malformed change payloads
                logger.warning(f"Could not reconcile pending change {change.get('id')}: {e}")
                kept = change
            if kept is not None:
                reconciled.append(kept)
        return reconciled

    @staticmethod
    def _reconcile_one(profile_data: Dict, change: Dict) -> Optional[Dict]:
        change_type = change.get("change_type")
        section = change.get("section")
        field_path = change.get("field_path") or ""
        new_value = change.get("new_value")
        if not section or change_type not in ("add", "edit", "delete"):
            return change

        # Same routing as _apply_change, so we judge the change against the data it would touch.
        sub_array = ProfileService._resolve_preferences_sub_array(section, field_path, change_type, new_value)
        if sub_array:
            preferences = profile_data.get("preferences")
            items = preferences.get(sub_array) if isinstance(preferences, dict) else None
            return ProfileService._reconcile_list_change(items, sub_array, change)
        if section in ("patient", "preferences"):
            current = profile_data.get(section)
            return ProfileService._reconcile_dict_change(current if isinstance(current, dict) else {}, change)
        return ProfileService._reconcile_list_change(profile_data.get(section), section, change)

    @staticmethod
    def _proposed_fields(new_value: Any) -> Dict:
        """The keys an accepted add/edit would actually write (nulls are placeholders, never writes)."""
        if not isinstance(new_value, dict):
            return {}
        return {k: v for k, v in new_value.items() if k != "id" and v is not None}

    @staticmethod
    def _same(current: Any, proposed: Any) -> bool:
        """Value equality that ignores whitespace/case differences between two scalars."""
        scalars = (str, int, float, bool, type(None))
        if isinstance(current, scalars) and isinstance(proposed, scalars):
            norm = lambda v: " ".join(str(v).split()).casefold() if v is not None else ""
            return norm(current) == norm(proposed)
        return current == proposed

    @staticmethod
    def _reconcile_list_change(items: Any, list_name: str, change: Dict) -> Optional[Dict]:
        change_type = change.get("change_type")
        item_id = change.get("item_id")
        field_path = change.get("field_path") or ""
        new_value = change.get("new_value")
        # Unwrap the {"<list_name>": [{...}]} shape the AI sometimes produces (mirrors _apply_change)
        if isinstance(new_value, dict) and isinstance(new_value.get(list_name), list):
            new_value = new_value[list_name][0] if new_value[list_name] else new_value

        items = [i for i in (items if isinstance(items, list) else []) if isinstance(i, dict)]
        target = next((i for i in items if item_id and i.get("id") == item_id), None)

        if change_type == "add":
            if isinstance(new_value, dict) and ProfileService._matching_item(items, list_name, new_value) is not None:
                return None
            return change

        if target is None:
            return None  # the item was removed by hand; nothing left to edit or delete

        if change_type == "delete":
            return {**change, "old_value": copy.deepcopy(target)}

        # change_type == "edit"
        if isinstance(new_value, dict):
            proposed = ProfileService._proposed_fields(new_value)
            if not proposed or all(ProfileService._same(target.get(k), v) for k, v in proposed.items()):
                return None
            return {**change, "old_value": copy.deepcopy(target)}

        field_name = field_path.split(".")[-1] if field_path else None
        if field_name:
            if ProfileService._same(target.get(field_name), new_value):
                return None
            return {**change, "old_value": copy.deepcopy(target.get(field_name))}
        return change

    @staticmethod
    def _reconcile_dict_change(current: Dict, change: Dict) -> Optional[Dict]:
        change_type = change.get("change_type")
        section = change.get("section")
        field_path = change.get("field_path") or ""
        new_value = change.get("new_value")
        field_name = field_path.split(".")[-1] if field_path else None
        if field_name == section:
            field_name = None  # field_path was just the section name

        if change_type == "delete":
            if not field_name or current.get(field_name) in (None, "", [], {}):
                return None
            return {**change, "old_value": copy.deepcopy(current.get(field_name))}

        # add / edit behave the same on a single-object section
        if isinstance(new_value, dict):
            proposed = ProfileService._proposed_fields(new_value)
            if not proposed or all(ProfileService._same(current.get(k), v) for k, v in proposed.items()):
                return None
            return {**change, "old_value": {k: copy.deepcopy(current.get(k)) for k in proposed}}

        if field_name:
            if ProfileService._same(current.get(field_name), new_value):
                return None
            return {**change, "old_value": copy.deepcopy(current.get(field_name))}
        return change

    # ------------------------------------------------------------------
    # Repeated adds: one rule for queuing (AI updates, Talk), accepting and manual edits
    # ------------------------------------------------------------------

    @staticmethod
    def _list_name(change: Dict, new_value: Any = None) -> Optional[str]:
        """The list an add/edit/delete touches (same routing as _apply_change), or None for
        the patient object and the two free-text preferences."""
        section = change.get("section")
        value = change.get("new_value") if new_value is None else new_value
        sub_array = ProfileService._resolve_preferences_sub_array(
            section, change.get("field_path") or "", change.get("change_type"), value)
        if sub_array:
            return sub_array
        if not section or section in ("patient", "preferences"):
            return None
        return section

    @staticmethod
    def _added_item(new_value: Any, list_name: Optional[str]) -> Optional[Dict]:
        """The item an add would create, unwrapping {"<list_name>": [{...}]} like _apply_change."""
        if isinstance(new_value, dict) and list_name and isinstance(new_value.get(list_name), list):
            new_value = new_value[list_name][0] if new_value[list_name] else None
        return new_value if isinstance(new_value, dict) and new_value else None

    @staticmethod
    def _items_in(profile_data: Optional[Dict], list_name: str) -> List[Dict]:
        """The profile's live list (not a copy), or an empty one."""
        data = profile_data or {}
        if list_name in PREFERENCES_ARRAY_FIELDS:
            holder = data.get("preferences")
            items = holder.get(list_name) if isinstance(holder, dict) else None
        else:
            items = data.get(list_name)
        return items if isinstance(items, list) else []

    @staticmethod
    def _match_kind(list_name: str, a: Dict, b: Dict) -> Optional[str]:
        """Whether two items of one list are the same thing.

        "same": the field that names them matches, with case, spacing and punctuation
        ignored, and for named things also what's in parentheses ("Acetaminophen (Tylenol)"
        is Tylenol), a strength or pill form in a medication's name ("Ibuprofen 600 mg
        tablet" is Ibuprofen) and a provider's title and credentials ("Dr. Avery Patel" is
        "Avery Patel, MD"). Events also need dates that don't differ: the same kind of visit
        on two dates is two events.
        "variant": a caregiver with the same relationship whose name looks misheard ("Priya"
        and "Preya", or "Priya Shah"). People only: a drug one letter off can be another drug.
        None: different things.
        """
        primary = PRIMARY_FIELDS.get(list_name)
        if not primary:
            return None
        if list_name in NAMED_LISTS:
            main_a, inner_a = _name_keys(list_name, a.get(primary))
            main_b, inner_b = _name_keys(list_name, b.get(primary))
            if not main_a or not main_b:
                return None
            if main_a == main_b or main_a in inner_b or main_b in inner_a:
                return "same"
            if list_name == "caregivers":
                relationship = _loose(a.get("relationship"))
                if relationship and relationship == _loose(b.get("relationship")) and _same_person_name(main_a, main_b):
                    return "variant"
            return None
        text_a = _loose(a.get(primary))
        if not text_a or text_a != _loose(b.get(primary)):
            return None
        if list_name == "events":
            date_a, date_b = _loose(a.get("date")), _loose(b.get("date"))
            if date_a and date_b and date_a != date_b:
                return None
        return "same"

    @staticmethod
    def _matching_item(items: Any, list_name: str, new_item: Dict) -> Optional[Tuple[Dict, str]]:
        """The item in `items` that `new_item` repeats and how ("same" before "variant")."""
        variant = None
        proposed_id = new_item.get("id")
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            kind = "same" if proposed_id and item.get("id") == proposed_id else \
                ProfileService._match_kind(list_name, item, new_item)
            if kind == "same":
                return item, kind
            if kind == "variant" and variant is None:
                variant = (item, kind)
        return variant

    @staticmethod
    def _missing_fields(existing: Dict, new_item: Optional[Dict]) -> Dict:
        """The fields of `new_item` that `existing` has no value for."""
        return {k: copy.deepcopy(v) for k, v in (new_item or {}).items()
                if k != "id" and v not in _EMPTY and existing.get(k) in _EMPTY}

    @staticmethod
    def _changed_fields(existing: Dict, new_item: Optional[Dict], list_name: str) -> Dict:
        """The fields of `new_item` that say something `existing` doesn't: missing there, or
        different. The name stays as it is ("Ibuprofen" doesn't become "Ibuprofen 600 mg")."""
        primary = PRIMARY_FIELDS.get(list_name)
        return {k: copy.deepcopy(v) for k, v in (new_item or {}).items()
                if k not in ("id", primary) and v not in _EMPTY and not ProfileService._same(existing.get(k), v)}

    @staticmethod
    def _as_edit(change: Dict, existing: Dict, list_name: str, fields: Dict) -> Optional[Dict]:
        """An add of an item the profile already has, as an edit of that item with `fields`.
        None when there's nothing to change (or the item has no id to edit by)."""
        item_id = existing.get("id")
        if not fields or not item_id:
            return None
        in_preferences = list_name in PREFERENCES_ARRAY_FIELDS
        edit = {
            **change,
            "change_type": "edit",
            "section": "preferences" if in_preferences else list_name,
            "item_id": item_id,
            "field_path": f"preferences.{list_name}" if in_preferences else f"{list_name}.{item_id}",
            "old_value": copy.deepcopy(existing),
            "new_value": {"id": item_id, **fields},
        }
        try:
            PendingChange.model_validate(edit)
        except ValidationError:
            return None
        return edit

    @staticmethod
    def _target(change: Dict) -> Optional[Tuple]:
        """What an edit or delete acts on: one list item, or a field of the patient /
        preferences object (None for the whole object). None for an add to a list."""
        list_name = ProfileService._list_name(change)
        if list_name:
            item_id = change.get("item_id")
            return ("item", list_name, item_id) if item_id else None
        section = change.get("section")
        field = (change.get("field_path") or "").split(".")[-1]
        return ("field", section, None if not field or field == section else field)

    @staticmethod
    def _merged(older: Any, newer: Any) -> Any:
        """Two proposed values for one target as one: the newer wins, a null in it is "unknown"."""
        if isinstance(older, dict) and isinstance(newer, dict):
            return {**older, **{k: v for k, v in newer.items() if v is not None}}
        return older if newer is None else newer

    @staticmethod
    def _same_value(a: Any, b: Any) -> bool:
        if isinstance(a, dict) and isinstance(b, dict):
            fa, fb = ProfileService._proposed_fields(a), ProfileService._proposed_fields(b)
            return fa.keys() == fb.keys() and all(ProfileService._same(fa[k], fb[k]) for k in fa)
        return ProfileService._same(a, b)

    @staticmethod
    def screen_suggestion(profile_data: Optional[Dict], pending: Optional[List[Dict]], change: Dict) -> Screened:
        """Decide what a new suggestion adds, given the profile and the suggestions already
        waiting for review. One rule for every section and every source (AI updates and Talk):

        - An add of something the profile has becomes an edit of that item carrying only
          what's new (a new dose), or is skipped ("in_profile") when nothing is. A misheard
          caregiver name ("variant") can only fill in what the item lacks.
        - An add of something already waiting is merged into that suggestion, which it
          replaces (new id, so a review screen showing the old one can't accept unseen
          values), or is skipped ("waiting") when it adds nothing.
        - An edit or delete that changes nothing, or targets an item that's gone, is skipped
          ("no_change"); a second edit of the same item or field is merged into the waiting
          one, and a second delete is skipped.
        """
        pending = [c for c in (pending or []) if isinstance(c, dict) and c is not change]
        list_name = ProfileService._list_name(change)
        item = ProfileService._added_item(change.get("new_value"), list_name) if list_name else None
        if change.get("change_type") == "add" and item:
            found = ProfileService._matching_item(ProfileService._items_in(profile_data, list_name), list_name, item)
            if found:
                existing, kind = found
                fields = (ProfileService._missing_fields(existing, item) if kind == "variant"
                          else ProfileService._changed_fields(existing, item, list_name))
                edit = ProfileService._as_edit(change, existing, list_name, fields)
                result = ProfileService.screen_suggestion(profile_data, pending, edit) if edit else None
                if result is None or result.reason == "no_change":
                    return Screened("skip", reason="in_profile", match=existing)
                return result._replace(match=existing)
            for other in pending:
                if other.get("change_type") != "add" or ProfileService._list_name(other) != list_name:
                    continue
                waiting = ProfileService._added_item(other.get("new_value"), list_name)
                found = ProfileService._matching_item([waiting], list_name, item) if waiting else None
                if not found:
                    continue
                extra = (ProfileService._missing_fields(waiting, item) if found[1] == "variant"
                         else ProfileService._changed_fields(waiting, item, list_name))
                if not extra:
                    return Screened("skip", reason="waiting")
                return Screened("queue", {**change, "new_value": {**copy.deepcopy(waiting), **extra}}, replaces=other)
            return Screened("queue", change)

        reconciled = ProfileService._reconcile_one(profile_data or {}, change)
        if reconciled is None:
            return Screened("skip", reason="no_change")
        target = ProfileService._target(reconciled)
        is_delete = reconciled.get("change_type") == "delete"
        for other in pending:
            if target is None or ProfileService._target(other) != target:
                continue
            if (other.get("change_type") == "delete") != is_delete:
                continue  # an edit and a delete of one item are both the person's to decide
            if is_delete:
                return Screened("skip", reason="waiting")
            merged = ProfileService._merged(other.get("new_value"), reconciled.get("new_value"))
            if ProfileService._same_value(merged, other.get("new_value")):
                return Screened("skip", reason="waiting")
            return Screened("queue", {**reconciled, "new_value": merged}, replaces=other)
        return Screened("queue", reconciled)

    @staticmethod
    def _accepted_repeat(profile_data: Optional[Dict], change: Dict, value: Any) -> Optional[Tuple[Dict, Dict]]:
        """For an add being accepted with `value` that repeats an item the profile has: that
        live item and the fields to write into it. What the person accepted wins over what
        the item says ("Lisinopril 20 mg" accepted over 10 mg), except that a misheard
        caregiver name only fills gaps. The name itself is never rewritten."""
        if change.get("change_type") != "add":
            return None
        list_name = ProfileService._list_name(change, value)
        new_item = ProfileService._added_item(value, list_name)
        if not list_name or not new_item:
            return None
        found = ProfileService._matching_item(ProfileService._items_in(profile_data, list_name), list_name, new_item)
        if not found:
            return None
        existing, kind = found
        fields = (ProfileService._missing_fields(existing, new_item) if kind == "variant"
                  else ProfileService._changed_fields(existing, new_item, list_name))
        return existing, fields

    @staticmethod
    def _collapse_repeats(profile_data: Dict) -> int:
        """Merge items that repeat an earlier one in the same list, in every list of a profile
        written in one go (a new or regenerated profile): the first keeps its values and
        gains only what the repeat adds. Returns how many were merged."""
        merged = 0
        lists = [(name, profile_data.get(name)) for name in PRIMARY_FIELDS if name not in PREFERENCES_ARRAY_FIELDS]
        preferences = profile_data.get("preferences")
        if isinstance(preferences, dict):
            lists += [(name, preferences.get(name)) for name in PREFERENCES_ARRAY_FIELDS]
        for list_name, items in lists:
            if not isinstance(items, list):
                continue
            kept: List[Any] = []
            for item in items:
                found = ProfileService._matching_item(kept, list_name, item) if isinstance(item, dict) else None
                if found:
                    found[0].update(ProfileService._missing_fields(found[0], item))
                    merged += 1
                else:
                    kept.append(item)
            items[:] = kept
        return merged

    @staticmethod
    def _pending_for_prompt(pending: Optional[List[Dict]]) -> str:
        """The review list as the profile update sees it: what each suggestion would do,
        newest kept when it's long. Reasoning and old values are left out."""
        if not pending:
            return "None."
        shown: List[Dict] = []
        size = 0
        for change in reversed(pending):
            if not isinstance(change, dict):
                continue
            entry = {k: change.get(k) for k in ("change_type", "section", "field_path", "item_id", "new_value")}
            size += len(json.dumps(entry, default=str))
            if size > MAX_PENDING_IN_PROMPT_CHARS:
                break
            shown.append(entry)
        return json.dumps(list(reversed(shown)), indent=2, default=str)

    @staticmethod
    def check_for_updates(
        db: Session,
        session_id: str
    ) -> Dict:
        """
        Check if there's new activity that would update the profile.

        Returns info about whether an update is needed.
        """
        profile = db.query(Profile).filter(Profile.session_id == session_id).first()

        result = {
            "needs_update": False,
            "has_profile": profile is not None,
            "last_update": None,
            "new_activity_count": 0,
            "new_conversation_count": 0,
            "new_journal_count": 0
        }

        if profile:
            result["last_update"] = profile.last_ai_update or profile.created_at

            # Fix legacy profiles that have None for last_processed IDs
            # by setting them to current max IDs (marks existing data as "seen")
            needs_commit = False
            from sqlalchemy import func

            # (skip the write when the session has no rows yet — None → None is
            # no fix, and committing it made every poll of /check write the DB)
            if profile.last_processed_conversation_id is None:
                max_conv_id = db.query(func.max(Conversation.id)).filter(
                    Conversation.session_id == session_id
                ).scalar()
                if max_conv_id is not None:
                    profile.last_processed_conversation_id = max_conv_id
                    needs_commit = True

            if profile.last_processed_journal_id is None:
                max_journal_id = db.query(func.max(JournalEntry.id)).filter(
                    JournalEntry.session_id == session_id
                ).scalar()
                if max_journal_id is not None:
                    profile.last_processed_journal_id = max_journal_id
                    needs_commit = True

            if needs_commit:
                db.commit()

            # Count new conversations (after last processed ID)
            new_convs = 0
            if profile.last_processed_conversation_id:
                new_convs = db.query(Conversation).filter(
                    Conversation.session_id == session_id,
                    Conversation.id > profile.last_processed_conversation_id
                ).count()

            # Count new journal entries (after last processed ID)
            new_journals = 0
            if profile.last_processed_journal_id:
                new_journals = db.query(JournalEntry).filter(
                    JournalEntry.session_id == session_id,
                    JournalEntry.id > profile.last_processed_journal_id
                ).count()

            result["new_conversation_count"] = new_convs
            result["new_journal_count"] = new_journals
            result["new_activity_count"] = new_convs + new_journals
            result["needs_update"] = result["new_activity_count"] > 0

        else:
            # No profile exists - check if there's any data to create one from
            conv_count = db.query(Conversation).filter(Conversation.session_id == session_id).count()
            journal_count = db.query(JournalEntry).filter(JournalEntry.session_id == session_id).count()
            result["new_conversation_count"] = conv_count
            result["new_journal_count"] = journal_count
            result["new_activity_count"] = conv_count + journal_count
            result["needs_update"] = result["new_activity_count"] > 0

        return result


# Create singleton instance
profile_service = ProfileService()
