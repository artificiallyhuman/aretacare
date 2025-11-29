from openai import OpenAI
from app.core.config import settings
from app.config import ai_config
from app.models.journal import JournalEntry, EntryType
from app.schemas.journal import (
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalSynthesisResult,
    JournalSuggestion
)
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
from collections import defaultdict
import logging
import json

logger = logging.getLogger(__name__)


class JournalService:
    """Service for managing journal entries and AI-powered synthesis"""

    # JSON Schema for structured output from GPT
    JOURNAL_SYNTHESIS_SCHEMA = {
        "type": "object",
        "properties": {
            "should_create": {
                "type": "boolean",
                "description": "Whether this interaction contains journal-worthy information"
            },
            "reasoning": {
                "type": "string",
                "description": "Brief explanation of the decision"
            },
            "suggested_entries": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "maxLength": 100},
                        "content": {"type": "string"},
                        "entry_type": {
                            "type": "string",
                            "enum": ["MEDICAL_UPDATE", "TREATMENT_CHANGE", "APPOINTMENT", "INSIGHT", "QUESTION", "MILESTONE"]
                        }
                    },
                    "required": ["title", "content", "entry_type"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["should_create", "reasoning", "suggested_entries"],
        "additionalProperties": False
    }

    def __init__(self, db: Session):
        self.db = db
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = ai_config.CHAT_MODEL

    async def assess_and_synthesize(
        self,
        user_message: str,
        ai_response: str,
        session_id: str,
        conversation_id: Optional[int] = None,
        entry_date: Optional[date] = None
    ) -> JournalSynthesisResult:
        """Assess if conversation contains journal-worthy information"""
        try:
            recent_entries = self._get_recent_entries(session_id, days=7)
            recent_context = self._format_recent_journal_brief(recent_entries)

            prompt = f"""Recent journal (last 7 days):
{recent_context}

Conversation:
User: {user_message}
Assistant: {ai_response}

Create a journal entry for this conversation. Set should_create to true unless this is just a greeting with no substance (like just "hi" or "thanks").

Choose the appropriate entry type (MEDICAL_UPDATE, TREATMENT_CHANGE, APPOINTMENT, QUESTION, INSIGHT, or MILESTONE).

Adjust detail level based on importance:
- Important topics (test results, new diagnoses, treatment changes) = detailed entry with context
- Routine topics (general questions, simple updates) = brief entry (1-2 sentences)
- Significant moments (milestones, major decisions) = thoughtful entry

IMPORTANT: Respond with ONLY a valid JSON object in this exact format, with no additional text before or after:
{{
  "should_create": true or false,
  "reasoning": "brief explanation",
  "suggested_entries": [
    {{
      "title": "entry title (max 100 chars)",
      "content": "entry content",
      "entry_type": "MEDICAL_UPDATE or TREATMENT_CHANGE or APPOINTMENT or QUESTION or INSIGHT or MILESTONE"
    }}
  ]
}}"""

            messages = [
                {"role": "system", "content": ai_config.JOURNAL_SYNTHESIS_PROMPT},
                {"role": "user", "content": prompt}
            ]

            # Use Responses API
            response = self.client.responses.create(
                model=self.model,
                input=messages
            )

            # Extract text from Responses API
            text = getattr(response, "output_text", None)
            if text is None and getattr(response, "output", None):
                first_item = response.output[0]
                if getattr(first_item, "content", None):
                    first_content = first_item.content[0]
                    text = getattr(first_content, "text", None)

            if not text:
                raise Exception("No response from AI")

            # Clean up the response - remove markdown code blocks if present
            cleaned_text = text.strip()
            if cleaned_text.startswith("```"):
                # Remove markdown code blocks
                lines = cleaned_text.split("\n")
                # Remove first line (```json or ```)
                lines = lines[1:]
                # Remove last line (```)
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned_text = "\n".join(lines).strip()

            result_json = json.loads(cleaned_text)

            # Convert to Pydantic models
            suggestions = [
                JournalSuggestion(
                    title=entry["title"],
                    content=entry["content"],
                    entry_type=EntryType(entry["entry_type"]),
                    confidence=1.0  # Always save - no confidence filtering
                )
                for entry in result_json["suggested_entries"]
            ]

            synthesis_result = JournalSynthesisResult(
                should_create=result_json["should_create"],
                reasoning=result_json["reasoning"],
                suggested_entries=suggestions
            )

            # Auto-save ALL suggested entries with user's date
            use_date = entry_date if entry_date else date.today()
            for suggestion in suggestions:
                await self.create_entry(
                    session_id=session_id,
                    entry_data=JournalEntryCreate(
                        title=suggestion.title,
                        content=suggestion.content,
                        entry_type=suggestion.entry_type,
                        entry_date=use_date
                    ),
                    created_by="ai",
                    source_message_ids=[conversation_id] if conversation_id else None
                )

            return synthesis_result

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error during journal synthesis: {e}")
            logger.error(f"Response text: {text if 'text' in locals() else 'No text'}")
            return JournalSynthesisResult(
                should_create=False,
                reasoning="Error parsing AI response",
                suggested_entries=[]
            )
        except Exception as e:
            logger.error(f"Journal synthesis error: {e}", exc_info=True)
            return JournalSynthesisResult(
                should_create=False,
                reasoning="Error during synthesis",
                suggested_entries=[]
            )

    async def format_journal_context(
        self,
        session_id: str,
        max_tokens: int = None
    ) -> str:
        """Format journal context for conversation with tiered loading"""
        if max_tokens is None:
            max_tokens = ai_config.MAX_JOURNAL_TOKENS
        try:
            entries = self.db.query(JournalEntry).filter(
                JournalEntry.session_id == session_id
            ).order_by(desc(JournalEntry.entry_date)).all()

            if not entries:
                return "# Care Journal\n\nNo journal entries yet."

            now = date.today()
            full_detail = []
            summarized = []
            titles_only = []

            for entry in entries:
                days_old = (now - entry.entry_date).days

                if days_old <= 7:
                    full_detail.append(entry)
                elif days_old <= 30:
                    summarized.append(entry)
                else:
                    titles_only.append(entry)

            context = "# Care Journal Context\n\n"

            # Recent entries (full detail)
            if full_detail:
                context += "## Recent Entries (Last 7 Days)\n\n"
                for e in full_detail:
                    context += f"**{e.entry_date}** [{e.entry_type.value}] **{e.title}**\n{e.content}\n\n"

            # Mid-range entries (summarized)
            if summarized:
                context += "## Previous Entries (8-30 Days Ago)\n\n"
                for e in summarized:
                    summary = e.content[:150] + "..." if len(e.content) > 150 else e.content
                    context += f"**{e.entry_date}** {e.title}: {summary}\n\n"

            # Older entries (titles only)
            if titles_only:
                context += "## Earlier History (30+ Days Ago)\n\n"
                by_month = self._group_by_month(titles_only)
                for month, month_entries in by_month.items():
                    context += f"**{month}**: "
                    context += ", ".join([e.title for e in month_entries])
                    context += "\n\n"

            # Rough token limit (4 chars per token estimate)
            if len(context) > max_tokens * 4:
                context = context[:max_tokens * 4] + "\n\n[Context truncated]"

            return context

        except Exception as e:
            logger.error(f"Error formatting journal context: {e}")
            return "# Care Journal\n\nUnable to load journal context."

    async def create_entry(
        self,
        session_id: str,
        entry_data: JournalEntryCreate,
        created_by: str,
        source_message_ids: Optional[List[int]] = None
    ) -> JournalEntry:
        """Create a new journal entry"""
        try:
            entry_date = entry_data.entry_date or date.today()

            entry = JournalEntry(
                session_id=session_id,
                entry_date=entry_date,
                entry_type=entry_data.entry_type,
                title=entry_data.title,
                content=entry_data.content,
                created_by=created_by,
                source_message_ids=source_message_ids or []
            )

            self.db.add(entry)
            self.db.commit()
            self.db.refresh(entry)

            # Update session journal count
            from app.models.session import Session
            session = self.db.query(Session).filter(Session.id == session_id).first()
            if session:
                session.journal_entry_count += 1
                session.last_journal_synthesis = datetime.utcnow()
                self.db.commit()

            return entry

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating journal entry: {e}")
            raise

    async def update_entry(
        self,
        entry_id: int,
        updates: JournalEntryUpdate,
        user_id: str
    ) -> Optional[JournalEntry]:
        """Update an existing journal entry"""
        try:
            entry = self.db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
            if not entry:
                return None

            # Verify user has access to this session (owner or collaborator)
            from app.models.session import Session
            from app.models.session_collaborator import SessionCollaborator
            session = self.db.query(Session).filter(Session.id == entry.session_id).first()
            if not session:
                return None

            is_owner = session.owner_id == user_id
            is_collaborator = self.db.query(SessionCollaborator).filter(
                SessionCollaborator.session_id == session.id,
                SessionCollaborator.user_id == user_id
            ).first() is not None

            if not (is_owner or is_collaborator):
                return None

            # Apply updates
            if updates.title is not None:
                entry.title = updates.title
            if updates.content is not None:
                entry.content = updates.content
            if updates.entry_type is not None:
                entry.entry_type = updates.entry_type
            if updates.entry_date is not None:
                entry.entry_date = updates.entry_date

            entry.updated_at = datetime.utcnow()

            self.db.commit()
            self.db.refresh(entry)

            return entry

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating journal entry: {e}")
            raise

    async def delete_entry(
        self,
        entry_id: int,
        user_id: str
    ) -> bool:
        """Delete a journal entry"""
        try:
            entry = self.db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
            if not entry:
                return False

            # Verify user has access to this session (owner or collaborator)
            from app.models.session import Session
            from app.models.session_collaborator import SessionCollaborator
            session = self.db.query(Session).filter(Session.id == entry.session_id).first()
            if not session:
                return False

            is_owner = session.owner_id == user_id
            is_collaborator = self.db.query(SessionCollaborator).filter(
                SessionCollaborator.session_id == session.id,
                SessionCollaborator.user_id == user_id
            ).first() is not None

            if not (is_owner or is_collaborator):
                return False

            self.db.delete(entry)

            # Update session journal count
            if session:
                session.journal_entry_count = max(0, session.journal_entry_count - 1)

            self.db.commit()
            return True

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting journal entry: {e}")
            raise

    async def get_entries_by_date(
        self,
        session_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, List[JournalEntry]]:
        """Get entries grouped by date"""
        try:
            query = self.db.query(JournalEntry).filter(JournalEntry.session_id == session_id)

            if start_date:
                query = query.filter(JournalEntry.entry_date >= start_date)
            if end_date:
                query = query.filter(JournalEntry.entry_date <= end_date)

            # Sort by date descending, then by created_at descending (most recent first within each date)
            entries = query.order_by(desc(JournalEntry.entry_date), desc(JournalEntry.created_at)).all()

            # Group by date
            grouped = defaultdict(list)
            for entry in entries:
                date_str = entry.entry_date.isoformat()
                grouped[date_str].append(entry)

            return dict(grouped)

        except Exception as e:
            logger.error(f"Error getting journal entries: {e}")
            return {}

    async def get_entries_for_date(
        self,
        session_id: str,
        target_date: date
    ) -> List[JournalEntry]:
        """Get all entries for a specific date"""
        try:
            entries = self.db.query(JournalEntry).filter(
                and_(
                    JournalEntry.session_id == session_id,
                    JournalEntry.entry_date == target_date
                )
            ).order_by(desc(JournalEntry.created_at)).all()

            return entries

        except Exception as e:
            logger.error(f"Error getting entries for date: {e}")
            return []

    # Helper methods

    def _get_recent_entries(self, session_id: str, days: int = 7) -> List[JournalEntry]:
        """Get journal entries from last N days"""
        cutoff_date = date.today() - timedelta(days=days)
        return self.db.query(JournalEntry).filter(
            and_(
                JournalEntry.session_id == session_id,
                JournalEntry.entry_date >= cutoff_date
            )
        ).order_by(desc(JournalEntry.entry_date)).all()

    def _format_recent_journal_brief(self, entries: List[JournalEntry]) -> str:
        """Format recent journal entries briefly for synthesis context"""
        if not entries:
            return "No recent journal entries."

        lines = []
        for entry in entries:
            lines.append(f"- {entry.entry_date} [{entry.entry_type.value}]: {entry.title}")

        return "\n".join(lines)

    def _group_by_month(self, entries: List[JournalEntry]) -> Dict[str, List[JournalEntry]]:
        """Group entries by month"""
        grouped = defaultdict(list)
        for entry in entries:
            month_key = entry.entry_date.strftime("%B %Y")
            grouped[month_key].append(entry)
        return dict(grouped)
