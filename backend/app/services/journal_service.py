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
                            "enum": ["MEDICAL_UPDATE", "TREATMENT_CHANGE", "APPOINTMENT", "INSIGHT", "MILESTONE", "OTHER"]
                        },
                        "entry_date": {
                            "type": "string",
                            "description": "Date for this entry in YYYY-MM-DD format. Use today's date unless the conversation mentions a specific date (e.g., 'on Thursday', 'next week', 'yesterday'). Can be past, present, or future.",
                            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
                        }
                    },
                    "required": ["title", "content", "entry_type", "entry_date"],
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

    async def synthesize_from_document(
        self,
        filename: str,
        extracted_text: str,
        ai_description: str,
        session_id: str,
        entry_date: Optional[date] = None
    ) -> JournalSynthesisResult:
        """Synthesize comprehensive journal entry from uploaded medical document"""
        try:
            recent_entries = self._get_recent_entries(session_id, days=7)
            recent_context = self._format_recent_journal_brief(recent_entries)

            # Get today's date for context
            today = entry_date if entry_date else date.today()
            today_str = today.isoformat()
            day_of_week = today.strftime('%A')

            # Prepare document content - use full extracted text for comprehensive synthesis
            document_content = f"Filename: {filename}\n\n"
            if ai_description:
                document_content += f"Document Type/Summary: {ai_description}\n\n"
            if extracted_text:
                document_content += f"Full Document Content:\n{extracted_text}"
            else:
                document_content += "No text content could be extracted from this document."

            prompt = f"""TODAY'S DATE: {today_str} ({day_of_week})

Recent journal (last 7 days):
{recent_context}

DOCUMENT UPLOADED:
{document_content}

Create a comprehensive journal entry from this document. Extract and preserve ALL relevant information as this will be the ONLY accessible record for future AI conversations.

EXTRACTION GUIDANCE:
- Extract ALL dates, names, contact information, numeric values with units
- Include ALL specific details (account numbers, reference codes, costs, addresses, phone numbers)
- Preserve exact terminology and wording from the document
- Don't summarize - list actual information (e.g., "WBC 7.2 K/uL" not "normal values")
- Include ALL instructions, plans, next steps, and follow-up information
- Be COMPREHENSIVE not concise - over-documentation is better than losing details

FORMATTING FOR READABILITY:
- Use **bold** for section headers (e.g., **Lab Results:**, **Medications:**, **Contact Info:**)
- Use bullet points (-) for lists of items
- Use blank lines to separate sections
- For complex documents with lots of data, organize into clear sections
- Make entries scannable and easy to read

Choose the appropriate entry type:
- MEDICAL_UPDATE: Test results, lab values, imaging findings, diagnoses, clinical observations, vital signs, symptoms
- TREATMENT_CHANGE: Medications, dosage changes, treatment plans, procedures scheduled, therapies
- APPOINTMENT: Visit notes, consultation summaries, scheduled appointments, provider information
- MILESTONE: Significant diagnoses, treatment completions, major health transitions, hospital discharges
- INSIGHT: Clinical impressions, care team observations, recommendations, care instructions
- OTHER: Administrative documents, insurance/billing information, contact information, consent forms, care notes, general records

ENTRY SPLITTING GUIDANCE:
- If document contains information about multiple dates (e.g., past visit + future appointment + billing date), create SEPARATE entries for each date
- Default to TODAY ({today_str}) unless the document clearly indicates a different date
- For visit notes, use the visit date; for test results, use the test date; for appointments, use the appointment date; for bills, use the service date or statement date

CRITICAL - JOURNAL ENTRY WRITING STYLE:
- Write in third-person observational style
- Do NOT use pronouns: "I", "me", "my", "we", "us", "they", "them", "someone"
- Describe only the facts, data, and information from the document
- Focus on what the document contains

IMPORTANT: Respond with ONLY a valid JSON object in this exact format, with no additional text before or after:
{{
  "should_create": true,
  "reasoning": "Document contains information that should be preserved in journal",
  "suggested_entries": [
    {{
      "title": "descriptive title (max 100 chars)",
      "content": "comprehensive extraction of all relevant information from document",
      "entry_type": "MEDICAL_UPDATE or TREATMENT_CHANGE or APPOINTMENT or INSIGHT or MILESTONE or OTHER",
      "entry_date": "YYYY-MM-DD"
    }}
  ]
}}"""

            messages = [
                {"role": "system", "content": ai_config.DOCUMENT_JOURNAL_SYNTHESIS_PROMPT},
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
                lines = cleaned_text.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned_text = "\n".join(lines).strip()

            result_json = json.loads(cleaned_text)

            # Convert to Pydantic models
            suggestions = []
            for entry in result_json["suggested_entries"]:
                suggested_date = None
                if "entry_date" in entry and entry["entry_date"]:
                    try:
                        suggested_date = date.fromisoformat(entry["entry_date"])
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid entry_date '{entry.get('entry_date')}', using today")
                        suggested_date = entry_date if entry_date else date.today()
                else:
                    suggested_date = entry_date if entry_date else date.today()

                suggestions.append(JournalSuggestion(
                    title=entry["title"],
                    content=entry["content"],
                    entry_type=EntryType(entry["entry_type"]),
                    confidence=1.0,
                    entry_date=suggested_date
                ))

            synthesis_result = JournalSynthesisResult(
                should_create=result_json["should_create"],
                reasoning=result_json["reasoning"],
                suggested_entries=suggestions
            )

            # Auto-save ALL suggested entries
            for suggestion in suggestions:
                await self.create_entry(
                    session_id=session_id,
                    entry_data=JournalEntryCreate(
                        title=suggestion.title,
                        content=suggestion.content,
                        entry_type=suggestion.entry_type,
                        entry_date=suggestion.entry_date
                    ),
                    created_by="ai",
                    source_message_ids=None
                )

            return synthesis_result

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error during document journal synthesis: {e}")
            logger.error(f"Response text: {text if 'text' in locals() else 'No text'}")
            return JournalSynthesisResult(
                should_create=False,
                reasoning="Error parsing AI response",
                suggested_entries=[]
            )
        except Exception as e:
            logger.error(f"Document journal synthesis error: {e}", exc_info=True)
            return JournalSynthesisResult(
                should_create=False,
                reasoning="Error during synthesis",
                suggested_entries=[]
            )

    async def synthesize_from_audio(
        self,
        filename: str,
        transcribed_text: str,
        ai_summary: str,
        duration: float,
        session_id: str,
        entry_date: Optional[date] = None
    ) -> JournalSynthesisResult:
        """Synthesize comprehensive journal entry from audio recording transcription"""
        try:
            recent_entries = self._get_recent_entries(session_id, days=7)
            recent_context = self._format_recent_journal_brief(recent_entries)

            # Get today's date for context
            today = entry_date if entry_date else date.today()
            today_str = today.isoformat()
            day_of_week = today.strftime('%A')

            # Prepare audio content - use full transcription for comprehensive synthesis
            duration_min = int(duration // 60)
            duration_sec = int(duration % 60)
            audio_content = f"Filename: {filename}\n"
            audio_content += f"Duration: {duration_min}m {duration_sec}s\n\n"
            if ai_summary:
                audio_content += f"Recording Type/Summary: {ai_summary}\n\n"
            if transcribed_text:
                audio_content += f"Full Transcription:\n{transcribed_text}"
            else:
                audio_content += "No transcription available for this recording."

            prompt = f"""TODAY'S DATE: {today_str} ({day_of_week})

Recent journal (last 7 days):
{recent_context}

AUDIO RECORDING TRANSCRIPTION:
{audio_content}

Create a comprehensive journal entry from this audio recording. Extract and preserve ALL relevant information as this will be the ONLY accessible record for future AI conversations.

EXTRACTION GUIDANCE:
- Extract ALL dates, times, names, numeric values (vital signs, measurements, dosages)
- Include ALL specific details about symptoms, observations, or changes
- Preserve medical terms and exact wording used
- Don't summarize - list actual information (e.g., "pain rated 6/10" not "experiencing pain")
- Include ALL instructions, action items, questions, or concerns mentioned
- Capture emotional context when relevant to the care journey
- Be COMPREHENSIVE not concise - over-documentation is better than losing details

FORMATTING FOR READABILITY:
- Use **bold** for section headers (e.g., **Symptoms:**, **Vitals:**, **Plan:**)
- Use bullet points (-) for lists of items
- Use blank lines to separate sections
- For complex updates with lots of information, organize into clear sections
- Make entries scannable and easy to read

Choose the appropriate entry type:
- MEDICAL_UPDATE: Symptoms, health observations, vital signs, test results discussed, clinical updates
- TREATMENT_CHANGE: Medications, dosage changes, treatments started/stopped, therapy changes
- APPOINTMENT: Visit recaps, appointment summaries, upcoming appointments, provider discussions
- MILESTONE: Significant achievements, progress, important decisions, transitions
- INSIGHT: Personal observations, reflections, concerns, questions, care realizations
- OTHER: General updates, family coordination, administrative notes, care logistics, daily reflections

ENTRY SPLITTING GUIDANCE:
- If audio mentions information about multiple dates (e.g., yesterday's symptom + today's observation + tomorrow's appointment), create SEPARATE entries for each date
- Default to TODAY ({today_str}) unless the audio clearly indicates a different date
- For appointment recaps, use the appointment date; for scheduled appointments, use the future date
- For symptom reports, use the date when symptoms were observed/reported

CRITICAL - JOURNAL ENTRY WRITING STYLE:
- Write in third-person observational style
- Do NOT use pronouns: "I", "me", "my", "we", "us", "they", "them", "someone"
- Describe only the facts, data, observations, and information from the audio
- Focus on what was communicated in the recording

IMPORTANT: Respond with ONLY a valid JSON object in this exact format, with no additional text before or after:
{{
  "should_create": true,
  "reasoning": "Audio recording contains information that should be preserved in journal",
  "suggested_entries": [
    {{
      "title": "descriptive title (max 100 chars)",
      "content": "comprehensive extraction of all relevant information from audio",
      "entry_type": "MEDICAL_UPDATE or TREATMENT_CHANGE or APPOINTMENT or INSIGHT or MILESTONE or OTHER",
      "entry_date": "YYYY-MM-DD"
    }}
  ]
}}"""

            messages = [
                {"role": "system", "content": ai_config.AUDIO_JOURNAL_SYNTHESIS_PROMPT},
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
                lines = cleaned_text.split("\n")
                lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned_text = "\n".join(lines).strip()

            result_json = json.loads(cleaned_text)

            # Convert to Pydantic models
            suggestions = []
            for entry in result_json["suggested_entries"]:
                suggested_date = None
                if "entry_date" in entry and entry["entry_date"]:
                    try:
                        suggested_date = date.fromisoformat(entry["entry_date"])
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid entry_date '{entry.get('entry_date')}', using today")
                        suggested_date = entry_date if entry_date else date.today()
                else:
                    suggested_date = entry_date if entry_date else date.today()

                suggestions.append(JournalSuggestion(
                    title=entry["title"],
                    content=entry["content"],
                    entry_type=EntryType(entry["entry_type"]),
                    confidence=1.0,
                    entry_date=suggested_date
                ))

            synthesis_result = JournalSynthesisResult(
                should_create=result_json["should_create"],
                reasoning=result_json["reasoning"],
                suggested_entries=suggestions
            )

            # Auto-save ALL suggested entries
            for suggestion in suggestions:
                await self.create_entry(
                    session_id=session_id,
                    entry_data=JournalEntryCreate(
                        title=suggestion.title,
                        content=suggestion.content,
                        entry_type=suggestion.entry_type,
                        entry_date=suggestion.entry_date
                    ),
                    created_by="ai",
                    source_message_ids=None
                )

            return synthesis_result

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error during audio journal synthesis: {e}")
            logger.error(f"Response text: {text if 'text' in locals() else 'No text'}")
            return JournalSynthesisResult(
                should_create=False,
                reasoning="Error parsing AI response",
                suggested_entries=[]
            )
        except Exception as e:
            logger.error(f"Audio journal synthesis error: {e}", exc_info=True)
            return JournalSynthesisResult(
                should_create=False,
                reasoning="Error during synthesis",
                suggested_entries=[]
            )

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

            # Get today's date for context
            today = entry_date if entry_date else date.today()
            today_str = today.isoformat()
            day_of_week = today.strftime('%A')  # e.g., "Monday"

            prompt = f"""TODAY'S DATE: {today_str} ({day_of_week})

Recent journal (last 7 days):
{recent_context}

Conversation:
User: {user_message}
Assistant: {ai_response}

Create a journal entry for this conversation. Set should_create to true unless this is just a greeting with no substance (like just "hi" or "thanks").

Choose the appropriate entry type:
- MEDICAL_UPDATE: Test results, diagnoses, symptoms, health status changes
- TREATMENT_CHANGE: New medications, dosage changes, treatment plans, procedures
- APPOINTMENT: Scheduled appointments, visits, consultations (past or future)
- MILESTONE: Significant achievements, first-time events, major progress moments
- INSIGHT: Personal reflections, emotional processing, understanding developed through conversation (NOT for factual medical information)
- OTHER: General questions, administrative matters, non-medical topics

IMPORTANT: Use INSIGHT sparingly - only for genuine personal reflections or emotional insights gained through discussion. Most medical information should use MEDICAL_UPDATE or TREATMENT_CHANGE.

Adjust detail level based on importance:
- Important topics (test results, new diagnoses, treatment changes) = detailed entry with context
- Routine topics (general questions, simple updates) = brief entry (1-2 sentences)
- Significant moments (milestones, major decisions) = thoughtful entry

ENTRY SPLITTING GUIDANCE:
- **ALWAYS create separate entries for events on different dates**
- Examples requiring SEPARATE entries:
  * User mentions an appointment on Thursday → Create entry dated for Thursday
  * User discusses a blood test from yesterday → Create entry dated for yesterday
  * User talks about today's symptoms AND mentions a future appointment → 2 entries (one for today, one for future date)
  * User recaps a past visit AND schedules a future appointment → 2 entries (one for past date, one for future date)
- Only combine into ONE entry if everything discussed relates to the same date (usually today)
- Future appointments must get their own entry on the scheduled date
- Past events must get their own entry on the date they occurred

CRITICAL - JOURNAL ENTRY WRITING STYLE:
- Write entries in third-person observational style
- Do NOT use pronouns: "I", "me", "my", "we", "us", "they", "them", "someone", "the user"
- Describe only the events, information, or medical facts
- Focus on what happened, what was discussed, or what is scheduled
- Examples:
  * BAD: "I have an appointment scheduled"
  * GOOD: "Cardiology appointment scheduled"
  * BAD: "The user reported symptoms"
  * GOOD: "Symptoms reported include headache and fatigue"

DATE INTERPRETATION:
- Default to TODAY ({today_str}) unless the user mentions a specific date
- Interpret relative dates accurately:
  * "yesterday" = {(today - timedelta(days=1)).isoformat()}
  * "tomorrow" = {(today + timedelta(days=1)).isoformat()}
  * "on Thursday", "next Monday", etc. = calculate the actual date
  * "last week", "next week" = calculate the appropriate date
  * Past appointments should use the date they occurred
  * Future appointments should use the scheduled date
- ALWAYS use YYYY-MM-DD format for entry_date

IMPORTANT: Respond with ONLY a valid JSON object in this exact format, with no additional text before or after:
{{
  "should_create": true or false,
  "reasoning": "brief explanation",
  "suggested_entries": [
    {{
      "title": "entry title (max 100 chars)",
      "content": "entry content",
      "entry_type": "MEDICAL_UPDATE or TREATMENT_CHANGE or APPOINTMENT or INSIGHT or MILESTONE or OTHER",
      "entry_date": "YYYY-MM-DD"
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
            suggestions = []
            for entry in result_json["suggested_entries"]:
                # Parse entry_date if provided, otherwise use today
                suggested_date = None
                if "entry_date" in entry and entry["entry_date"]:
                    try:
                        suggested_date = date.fromisoformat(entry["entry_date"])
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid entry_date '{entry.get('entry_date')}', using today")
                        suggested_date = entry_date if entry_date else date.today()
                else:
                    suggested_date = entry_date if entry_date else date.today()

                suggestions.append(JournalSuggestion(
                    title=entry["title"],
                    content=entry["content"],
                    entry_type=EntryType(entry["entry_type"]),
                    confidence=1.0,  # Always save - no confidence filtering
                    entry_date=suggested_date
                ))

            synthesis_result = JournalSynthesisResult(
                should_create=result_json["should_create"],
                reasoning=result_json["reasoning"],
                suggested_entries=suggestions
            )

            # Auto-save ALL suggested entries with AI-determined dates
            for suggestion in suggestions:
                await self.create_entry(
                    session_id=session_id,
                    entry_data=JournalEntryCreate(
                        title=suggestion.title,
                        content=suggestion.content,
                        entry_type=suggestion.entry_type,
                        entry_date=suggestion.entry_date
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

    async def format_journal_context_split(
        self,
        session_id: str,
        max_tokens: int = None
    ) -> tuple[str, str]:
        """Format journal context split into older and recent parts for better AI context management"""
        if max_tokens is None:
            max_tokens = ai_config.MAX_JOURNAL_TOKENS
        try:
            entries = self.db.query(JournalEntry).filter(
                JournalEntry.session_id == session_id
            ).order_by(desc(JournalEntry.entry_date)).all()

            if not entries:
                return "", ""

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

            # OLDER CONTEXT (8+ days ago) - shown first in prompt, farther from current message
            older_context = ""
            if titles_only or summarized:
                older_context = "# Background Journal Context (Older History)\n\n"

                # Older entries (titles only) - show oldest first
                if titles_only:
                    older_context += "## Earlier History (30+ Days Ago)\n\n"
                    by_month = self._group_by_month(titles_only)
                    sorted_months = sorted(by_month.items(), key=lambda x: datetime.strptime(x[0], "%B %Y"))
                    for month, month_entries in sorted_months:
                        reversed_entries = list(reversed(month_entries))
                        older_context += f"**{month}**: "
                        older_context += ", ".join([e.title for e in reversed_entries])
                        older_context += "\n\n"

                # Mid-range entries (summarized) - show oldest first
                if summarized:
                    older_context += "## Previous Entries (8-30 Days Ago)\n\n"
                    for e in reversed(summarized):
                        summary = e.content[:150] + "..." if len(e.content) > 150 else e.content
                        older_context += f"**{e.entry_date}** {e.title}: {summary}\n\n"

            # RECENT CONTEXT (last 7 days) - will be shown later in prompt, closer to current message
            recent_context = ""
            if full_detail:
                recent_context = "# Recent Journal Context (Last 7 Days) ⚡\n\n"
                recent_context += "_This is the MOST RECENT journal information. Prioritize this over older context._\n\n"
                for e in reversed(full_detail):
                    recent_context += f"**{e.entry_date}** [{e.entry_type.value}] **{e.title}**\n{e.content}\n\n"

            return older_context, recent_context

        except Exception as e:
            logger.error(f"Error formatting journal context: {e}")
            return "", ""

    async def format_journal_context(
        self,
        session_id: str,
        max_tokens: int = None
    ) -> str:
        """Format journal context for conversation with tiered loading (legacy method for compatibility)"""
        older, recent = await self.format_journal_context_split(session_id, max_tokens)
        if not older and not recent:
            return "# Care Journal\n\nNo journal entries yet."
        return (older + "\n" + recent).strip()

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

            # Log to database for admin visibility
            try:
                from app.services.error_logger import log_database_error
                log_database_error(
                    db=self.db,
                    source="services.journal.create_entry",
                    error=e,
                    session_id=session_id,
                    details={
                        "entry_type": entry_type.value if entry_type else None,
                        "entry_date": entry_date.isoformat() if entry_date else None,
                        "title": title[:100] if title else None
                    }
                )
            except:
                pass  # Don't let error logging itself crash the app

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
