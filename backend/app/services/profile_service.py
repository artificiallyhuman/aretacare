from openai import AsyncOpenAI
import logging
import json
import uuid
import time
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from ..models.profile import Profile
from ..models.conversation import Conversation
from ..models.journal import JournalEntry
from ..models.session import Session as UserSession
from ..models.user import User
from ..models.session_collaborator import SessionCollaborator
from ..core.config import settings
from ..config import ai_config

logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# Token budget for profile generation (256K context window)
MAX_PROFILE_TOKENS = 230000  # Leave ~26K buffer for response + overhead
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

        # Fetch all journal entries (no arbitrary limit), ordered by date
        journal_entries = journal_query.order_by(JournalEntry.created_at.asc()).all()

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

            # Fetch all conversations (no arbitrary limit)
            conversations = conv_query.order_by(Conversation.created_at.asc()).all()

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
                historical_data=historical_data
            )

            # Call OpenAI
            response = await client.responses.create(
                model=ai_config.CHAT_MODEL,
                input=[
                    {"role": "system", "content": ai_config.PROFILE_SYSTEM_PROMPT},
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
            profile_data = ProfileService._parse_json_response(text)

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

            # Build the prompt
            user_prompt = ai_config.PROFILE_UPDATE_PROMPT.format(
                existing_profile=existing_profile,
                new_activity=new_activity
            )

            # Call OpenAI
            response = await client.responses.create(
                model=ai_config.CHAT_MODEL,
                input=[
                    {"role": "system", "content": ai_config.PROFILE_SYSTEM_PROMPT},
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
            update_data = ProfileService._parse_json_response(text)

            # ALL changes require approval - AI returns unified list of suggested changes
            pending = profile.pending_changes or []

            # Process all suggested changes from AI
            changes = update_data.get("changes", [])
            for change in changes:
                # Assign unique ID if not present
                if not change.get("id"):
                    change["id"] = str(uuid.uuid4())[:8]

                # Ensure field_path is set
                section = change.get("section", "")
                item_id = change.get("item_id")
                if not change.get("field_path"):
                    if item_id:
                        change["field_path"] = f"{section}.{item_id}"
                    else:
                        change["field_path"] = f"{section}.new_item"

                pending.append(change)

            profile.pending_changes = pending

            # Only update timestamps if there are no pending changes (means profile is up to date)
            # or if we actually modified profile_data. Don't update just for generating pending changes.
            profile.updated_at = datetime.utcnow()

            # Explicitly flag JSONB columns as modified for SQLAlchemy to detect changes
            flag_modified(profile, "profile_data")
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

        if change_type == "add":
            # Add a new item to a section
            if section == "patient":
                if not profile_data.get("patient"):
                    profile_data["patient"] = {}
                if isinstance(new_value, dict):
                    profile_data["patient"].update(new_value)
            elif section == "preferences":
                if not profile_data.get("preferences"):
                    profile_data["preferences"] = {}
                if isinstance(new_value, dict):
                    profile_data["preferences"].update(new_value)
            else:
                # Add to a list section
                if section not in profile_data:
                    profile_data[section] = []
                if isinstance(new_value, dict):
                    # Ensure the new item has an ID
                    if "id" not in new_value:
                        new_value["id"] = f"{section[:3]}_{uuid.uuid4().hex[:6]}"
                    profile_data[section].append(new_value)

        elif change_type == "delete":
            if section in ["patient", "preferences"]:
                # Delete a field from single object sections
                if profile_data.get(section):
                    # Extract field name from path
                    field_name = field_path.split(".")[-1]
                    if field_name in profile_data[section]:
                        del profile_data[section][field_name]
            else:
                # Delete an item from a list section
                if profile_data.get(section):
                    profile_data[section] = [
                        item for item in profile_data[section]
                        if item.get("id") != item_id
                    ]

        elif change_type == "edit":
            if section in ["patient", "preferences"]:
                # Edit a field in single object sections
                if not profile_data.get(section):
                    profile_data[section] = {}
                if isinstance(new_value, dict):
                    # Update entire object
                    profile_data[section].update(new_value)
                else:
                    # Update single field
                    field_name = field_path.split(".")[-1]
                    profile_data[section][field_name] = new_value
            else:
                # Edit a field in a list item
                if profile_data.get(section):
                    for item in profile_data[section]:
                        if item.get("id") == item_id:
                            if isinstance(new_value, dict):
                                # Update entire item (preserving ID)
                                original_id = item.get("id")
                                for key, value in new_value.items():
                                    if key != "id":
                                        item[key] = value
                                if original_id:
                                    item["id"] = original_id
                            else:
                                # Update single field
                                field_name = field_path.split(".")[-1]
                                item[field_name] = new_value
                            break

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
        profile.profile_data = profile_data
        profile.last_user_update = datetime.utcnow()
        profile.updated_at = datetime.utcnow()

        # Explicitly flag JSONB column as modified for SQLAlchemy to detect changes
        flag_modified(profile, "profile_data")

        db.commit()
        db.refresh(profile)

        return profile

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

            if profile.last_processed_conversation_id is None:
                max_conv_id = db.query(func.max(Conversation.id)).filter(
                    Conversation.session_id == session_id
                ).scalar()
                profile.last_processed_conversation_id = max_conv_id
                needs_commit = True

            if profile.last_processed_journal_id is None:
                max_journal_id = db.query(func.max(JournalEntry.id)).filter(
                    JournalEntry.session_id == session_id
                ).scalar()
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
