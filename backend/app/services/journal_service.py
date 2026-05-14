from openai import AsyncOpenAI
from app.core.config import settings
from app.config import ai_config
from app.models.journal import JournalEntry, EntryType
from app.models.profile import Profile
from app.models.document import Document
from app.models.audio_recording import AudioRecording
from app.schemas.journal import (
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalSynthesisResult,
    JournalSuggestion
)
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func, distinct
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
from collections import defaultdict
import logging
import json
import time

logger = logging.getLogger(__name__)


async def _log_journal_api_call(
    feature: str,
    response,
    start_time: float,
    success: bool,
    user_id: Optional[str] = None,
    error_message: Optional[str] = None
):
    """Log an API call from journal service"""
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
        logger.error(f"Failed to log journal API call: {e}")


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
                        "title": {
                            "type": "string",
                            "maxLength": 100,
                            "description": "Entry title - MUST be 100 characters or less"
                        },
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
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = ai_config.CHAT_MODEL

    # Maximum characters for text-based synthesis (~100K tokens)
    MAX_SYNTHESIS_CHARS = 400000

    async def synthesize_from_document(
        self,
        filename: str,
        ai_description: str,
        session_id: str,
        document_url: Optional[str] = None,
        content_type: Optional[str] = None,
        extracted_text: Optional[str] = None,
        entry_date: Optional[date] = None,
        document_id: Optional[int] = None,
        user_id: Optional[str] = None,
        auto_commit: bool = True
    ) -> JournalSynthesisResult:
        """Synthesize comprehensive journal entry from uploaded medical document using native file support"""
        try:
            # Truncate document text if too long for complete analysis
            text_truncated = False
            if extracted_text and len(extracted_text) > self.MAX_SYNTHESIS_CHARS:
                text_truncated = True
                original_len = len(extracted_text)
                logger.info(f"Document text ({original_len} chars) exceeds max synthesis limit ({self.MAX_SYNTHESIS_CHARS} chars), truncating")
                extracted_text = extracted_text[:self.MAX_SYNTHESIS_CHARS]
                extracted_text += f"\n\n[Document text truncated due to length — original was {original_len} characters]"

            recent_entries = self._get_recent_entries(session_id, days=7)
            recent_context = self._format_recent_journal_brief(recent_entries)

            # Get document-sourced entries with wider window for multi-part detection
            doc_entries = self._get_document_sourced_entries(session_id, days=30)
            doc_context = self._format_document_entries_brief(doc_entries)

            # Get today's date for context
            today = entry_date if entry_date else date.today()
            today_str = today.isoformat()
            day_of_week = today.strftime('%A')

            # Prepare document description for prompt
            document_info = f"Filename: {filename}"
            if ai_description:
                document_info += f"\nDocument Type/Summary: {ai_description}"

            # Use extracted text as fallback only if no document URL available
            if not document_url and extracted_text:
                document_info += f"\n\nExtracted text (OCR fallback):\n{extracted_text}"

            prompt = f"""TODAY'S DATE: {today_str} ({day_of_week})

Recent journal (last 7 days):
{recent_context}

Document-sourced journal entries (last 30 days):
{doc_context}

DOCUMENT UPLOADED:
{document_info}

Analyze the uploaded document and create a comprehensive journal entry. Extract and preserve ALL relevant information as this will be the ONLY accessible record for future AI conversations.

EXTRACTION GUIDANCE:
- Extract ALL dates, names, contact information, numeric values with units
- Include ALL specific details (account numbers, reference codes, costs, addresses, phone numbers)
- Preserve exact terminology and wording from the document
- Don't summarize - list actual information (e.g., "WBC 7.2 K/uL" not "normal values")
- Include ALL instructions, plans, next steps, and follow-up information
- Be COMPREHENSIVE not concise - over-documentation is better than losing details

MULTI-PART DOCUMENT DETECTION:
- Review the "Document-sourced journal entries" list above. If any appear to be from the same larger document as this one (similar filenames, overlapping content, same provider, sequential page numbers), note this at the TOP of your journal entry content
- Format: "**Part of a multi-part document.** Related entries: [titles]"
- Only add this note when the document IS part of a multi-part set. Do NOT mention multi-part detection if it is a standalone document.
- Documents may have been uploaded on different dates — focus on filename similarity and content overlap, not dates

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

CRITICAL - TITLE LENGTH CONSTRAINT:
- Title MUST be 100 characters or less (strict database limit)
- Keep titles concise and scannable - put details in content field
- If title is getting long, abbreviate or move detail to content

IMPORTANT: Respond with ONLY a valid JSON object in this exact format, with no additional text before or after:
{{
  "should_create": true,
  "reasoning": "Document contains information that should be preserved in journal",
  "suggested_entries": [
    {{
      "title": "descriptive title (MUST be ≤100 chars)",
      "content": "comprehensive extraction of all relevant information from document",
      "entry_type": "MEDICAL_UPDATE or TREATMENT_CHANGE or APPOINTMENT or INSIGHT or MILESTONE or OTHER",
      "entry_date": "YYYY-MM-DD"
    }}
  ]
}}"""

            messages = [
                {"role": "system", "content": ai_config.DOCUMENT_JOURNAL_SYNTHESIS_PROMPT}
            ]

            # Use native file support if document URL available
            if document_url:
                content_items = [{"type": "input_text", "text": prompt}]

                # Determine if it's an image, PDF, or text file
                if content_type and content_type.startswith("image/"):
                    content_items.append({
                        "type": "input_image",
                        "image_url": document_url
                    })
                elif content_type == "application/pdf":
                    # Use input_file for PDFs only (OpenAI doesn't support other file types)
                    content_items.append({
                        "type": "input_file",
                        "file_url": document_url
                    })
                elif content_type == "text/plain" and extracted_text:
                    # For text files, include the content directly
                    content_items.append({
                        "type": "input_text",
                        "text": f"\n--- Document Content ---\n{extracted_text}\n--- End Document ---"
                    })

                messages.append({
                    "role": "user",
                    "content": content_items
                })
            else:
                # Fallback to text-only if no URL (uses extracted text from prompt)
                messages.append({"role": "user", "content": prompt})

            # Track if we're using file URL (for fallback logic)
            use_file_url = document_url and content_type in (
                "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"
            )

            # Use Responses API with logging and file fallback
            start_time = time.time()
            response = None
            used_fallback = False

            try:
                response = await self.client.responses.create(
                    model=self.model,
                    input=messages
                )
                await _log_journal_api_call("journal_document_synthesis", response, start_time, True, user_id)
            except Exception as api_error:
                # Check if this is a file processing error that warrants fallback
                from app.services.openai_service import is_file_processing_error

                if use_file_url and extracted_text and content_type == "application/pdf" and is_file_processing_error(api_error):
                    logger.warning(f"OpenAI file processing failed for journal synthesis: {api_error}. Falling back to extracted text.")
                    used_fallback = True

                    # For context length errors, apply more aggressive truncation for fallback
                    fallback_text = extracted_text
                    if "context_length_exceeded" in str(api_error).lower():
                        reduced_limit = self.MAX_SYNTHESIS_CHARS // 2
                        if len(fallback_text) > reduced_limit:
                            fallback_text = fallback_text[:reduced_limit]
                            fallback_text += "\n\n[Document text further truncated for processing]"

                    # Rebuild messages with extracted text instead of file URL
                    fallback_prompt = prompt + f"\n\n--- Document Content (OCR/Extracted) ---\n{fallback_text}\n--- End Document ---"
                    fallback_messages = [
                        {"role": "system", "content": ai_config.DOCUMENT_JOURNAL_SYNTHESIS_PROMPT},
                        {"role": "user", "content": fallback_prompt}
                    ]

                    try:
                        response = await self.client.responses.create(
                            model=self.model,
                            input=fallback_messages
                        )
                        await _log_journal_api_call("journal_document_synthesis_text_fallback", response, start_time, True, user_id)
                    except Exception as fallback_error:
                        await _log_journal_api_call("journal_document_synthesis_text_fallback", None, start_time, False, user_id, str(fallback_error)[:500])
                        raise
                else:
                    await _log_journal_api_call("journal_document_synthesis", None, start_time, False, user_id, str(api_error)[:500])
                    raise

            # If response is None but we have extracted text for a PDF, try fallback
            if response is None and use_file_url and extracted_text and content_type == "application/pdf" and not used_fallback:
                logger.warning("OpenAI returned no response with file URL for journal synthesis. Falling back to extracted text.")
                # Apply reduced limit in case size contributed to the null response
                fallback_text = extracted_text
                reduced_limit = self.MAX_SYNTHESIS_CHARS // 2
                if len(fallback_text) > reduced_limit:
                    fallback_text = fallback_text[:reduced_limit]
                    fallback_text += "\n\n[Document text further truncated for processing]"
                fallback_prompt = prompt + f"\n\n--- Document Content (OCR/Extracted) ---\n{fallback_text}\n--- End Document ---"
                fallback_messages = [
                    {"role": "system", "content": ai_config.DOCUMENT_JOURNAL_SYNTHESIS_PROMPT},
                    {"role": "user", "content": fallback_prompt}
                ]
                response = await self.client.responses.create(
                    model=self.model,
                    input=fallback_messages
                )
                await _log_journal_api_call("journal_document_synthesis_text_fallback", response, start_time, True, user_id)

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

            # Build warning message if document was truncated
            synthesis_warning = None
            if text_truncated:
                synthesis_warning = "Document was too long for complete analysis. Only the first portion was processed for journal synthesis."

            synthesis_result = JournalSynthesisResult(
                should_create=result_json["should_create"],
                reasoning=result_json["reasoning"],
                suggested_entries=suggestions,
                warning=synthesis_warning
            )

            # Auto-save ALL suggested entries
            created_entries = []
            for suggestion in suggestions:
                # Check if document still exists before creating entry (may have been deleted/cancelled)
                if document_id:
                    doc_exists = self.db.query(Document).filter(Document.id == document_id).first()
                    if not doc_exists:
                        logger.info(f"Document {document_id} was deleted during processing, skipping journal entry creation")
                        break

                # Truncate title to 100 characters if needed (database limit)
                title = suggestion.title[:100] if len(suggestion.title) > 100 else suggestion.title

                entry = await self.create_entry(
                    session_id=session_id,
                    entry_data=JournalEntryCreate(
                        title=title,
                        content=suggestion.content,
                        entry_type=suggestion.entry_type,
                        entry_date=suggestion.entry_date
                    ),
                    created_by="ai",
                    source_message_ids=None,
                    source_document_id=document_id,
                    auto_commit=auto_commit
                )
                created_entries.append(entry)

            synthesis_result.created_entries = created_entries
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
            if not auto_commit:
                raise  # Let caller handle rollback when we don't own the transaction
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
        entry_date: Optional[date] = None,
        audio_id: Optional[int] = None,
        user_id: Optional[str] = None
    ) -> JournalSynthesisResult:
        """Synthesize comprehensive journal entry from audio recording transcription"""
        try:
            recent_entries = self._get_recent_entries(session_id, days=7)
            recent_context = self._format_recent_journal_brief(recent_entries)

            # Get today's date for context
            today = entry_date if entry_date else date.today()
            today_str = today.isoformat()
            day_of_week = today.strftime('%A')

            # Prepare audio content with token limit (~100K tokens = ~400K chars)
            max_transcription_chars = 400000
            duration_min = int(duration // 60)
            duration_sec = int(duration % 60)
            audio_content = f"Filename: {filename}\n"
            audio_content += f"Duration: {duration_min}m {duration_sec}s\n\n"
            if ai_summary:
                audio_content += f"Recording Type/Summary: {ai_summary}\n\n"
            if transcribed_text:
                # Truncate very long transcriptions to fit within token limit
                truncated_text = transcribed_text[:max_transcription_chars]
                if len(transcribed_text) > max_transcription_chars:
                    truncated_text += "\n\n[Transcription truncated due to length]"
                audio_content += f"Full Transcription:\n{truncated_text}"
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

CRITICAL - TITLE LENGTH CONSTRAINT:
- Title MUST be 100 characters or less (strict database limit)
- Keep titles concise and scannable - put details in content field
- If title is getting long, abbreviate or move detail to content

IMPORTANT: Respond with ONLY a valid JSON object in this exact format, with no additional text before or after:
{{
  "should_create": true,
  "reasoning": "Audio recording contains information that should be preserved in journal",
  "suggested_entries": [
    {{
      "title": "descriptive title (MUST be ≤100 chars)",
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

            # Use Responses API with logging
            start_time = time.time()
            response = None
            try:
                response = await self.client.responses.create(
                    model=self.model,
                    input=messages
                )
                await _log_journal_api_call("journal_audio_synthesis", response, start_time, True, user_id)
            except Exception as api_error:
                await _log_journal_api_call("journal_audio_synthesis", None, start_time, False, user_id, str(api_error)[:500])
                raise

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
                # Check if audio recording still exists before creating entry (may have been deleted/cancelled)
                if audio_id:
                    audio_exists = self.db.query(AudioRecording).filter(AudioRecording.id == audio_id).first()
                    if not audio_exists:
                        logger.info(f"Audio recording {audio_id} was deleted during processing, skipping journal entry creation")
                        break

                # Truncate title to 100 characters if needed (database limit)
                title = suggestion.title[:100] if len(suggestion.title) > 100 else suggestion.title

                await self.create_entry(
                    session_id=session_id,
                    entry_data=JournalEntryCreate(
                        title=title,
                        content=suggestion.content,
                        entry_type=suggestion.entry_type,
                        entry_date=suggestion.entry_date
                    ),
                    created_by="ai",
                    source_message_ids=None,
                    source_audio_id=audio_id
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
        entry_date: Optional[date] = None,
        audio_recording_id: Optional[int] = None,
        user_id: Optional[str] = None,
        auto_commit: bool = True
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

CRITICAL - TITLE LENGTH CONSTRAINT:
- Title MUST be 100 characters or less (strict database limit)
- Keep titles concise and scannable - put details in content field
- If title is getting long, abbreviate or move detail to content

IMPORTANT: Respond with ONLY a valid JSON object in this exact format, with no additional text before or after:
{{
  "should_create": true or false,
  "reasoning": "brief explanation",
  "suggested_entries": [
    {{
      "title": "entry title (MUST be ≤100 chars)",
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

            # Use Responses API with logging
            start_time = time.time()
            response = None
            try:
                response = await self.client.responses.create(
                    model=self.model,
                    input=messages
                )
                await _log_journal_api_call("journal_conversation_synthesis", response, start_time, True, user_id)
            except Exception as api_error:
                await _log_journal_api_call("journal_conversation_synthesis", None, start_time, False, user_id, str(api_error)[:500])
                raise

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
            created_entries = []
            for suggestion in suggestions:
                # Check if audio recording still exists before creating entry (may have been deleted/cancelled)
                if audio_recording_id:
                    audio_exists = self.db.query(AudioRecording).filter(AudioRecording.id == audio_recording_id).first()
                    if not audio_exists:
                        logger.info(f"Audio recording {audio_recording_id} was deleted during processing, skipping journal entry creation")
                        break

                # Truncate title to 100 characters if needed (database limit)
                title = suggestion.title[:100] if len(suggestion.title) > 100 else suggestion.title

                entry = await self.create_entry(
                    session_id=session_id,
                    entry_data=JournalEntryCreate(
                        title=title,
                        content=suggestion.content,
                        entry_type=suggestion.entry_type,
                        entry_date=suggestion.entry_date
                    ),
                    created_by="ai",
                    source_message_ids=[conversation_id] if conversation_id else None,
                    source_audio_id=audio_recording_id,
                    auto_commit=auto_commit
                )
                created_entries.append(entry)

            synthesis_result.created_entries = created_entries
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
            if not auto_commit:
                raise  # Let caller handle rollback when we don't own the transaction
            return JournalSynthesisResult(
                should_create=False,
                reasoning="Error during synthesis",
                suggested_entries=[]
            )

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count from text (roughly 1 token per 4 characters)"""
        if not text:
            return 0
        return len(text) // 4

    def _format_profile_context(self, session_id: str, max_tokens: int) -> str:
        """Format health profile for conversation context.

        Provides long-term memory and key patient information that complements
        the short-term journal entries.
        """
        try:
            # Fetch profile from database
            profile = self.db.query(Profile).filter(
                Profile.session_id == session_id
            ).first()

            if not profile or not profile.profile_data:
                return ""

            profile_data = profile.profile_data
            context = "# Health Profile (Long-Term Memory)\n\n"
            context += "_This is the HEALTH PROFILE - long-term, structured information about the patient, caregivers, providers, and care details. This complements the journal's day-to-day updates._\n\n"

            last_refreshed = max(
                (ts for ts in (profile.last_ai_update, profile.last_user_update, profile.created_at) if ts is not None),
                default=None,
            )
            if last_refreshed is not None:
                context += (
                    f"_Last refreshed: {last_refreshed.strftime('%Y-%m-%d')}. "
                    "Any changes the user mentions in this conversation that are newer than this date are NOT yet reflected below — "
                    "they remain pending until the user clicks \"Update\" on the Health Profile page and reviews the suggested edits._\n\n"
                )

            total_tokens = self._estimate_tokens(context)

            # Helper to add section if under token limit
            def try_add_section(section_text: str) -> bool:
                nonlocal context, total_tokens
                section_tokens = self._estimate_tokens(section_text)
                if total_tokens + section_tokens <= max_tokens:
                    context += section_text
                    total_tokens += section_tokens
                    return True
                return False

            # Patient Information (highest priority)
            patient = profile_data.get("patient")
            if patient:
                section = "**Patient:** "
                parts = []
                if patient.get("full_name"):
                    parts.append(patient["full_name"])
                if patient.get("preferred_name"):
                    parts.append(f'(goes by "{patient["preferred_name"]}")')
                if patient.get("age"):
                    parts.append(f"Age {patient['age']}")
                if patient.get("date_of_birth"):
                    parts.append(f"DOB {patient['date_of_birth']}")

                if parts:
                    section += ", ".join(parts) + "\n\n"
                    try_add_section(section)

            # Conditions (high priority)
            conditions = profile_data.get("conditions", [])
            if conditions:
                section = "**Conditions:** "
                active_conditions = [c for c in conditions if c.get("status") == "active"]
                if active_conditions:
                    condition_list = []
                    for c in active_conditions[:10]:  # Limit to 10 most important
                        cond_text = c.get("clinical_term") or "Unknown"
                        if c.get("description"):
                            cond_text += f" ({c['description']})"
                        condition_list.append(cond_text)
                    section += "; ".join(condition_list) + "\n\n"
                    if not try_add_section(section):
                        return context  # Out of tokens

            # Medications (high priority) - grouped by category
            medications = profile_data.get("medications", [])
            if medications:
                # Group by category
                by_category = {}
                for m in medications:
                    cat = m.get("category", "other")
                    if cat not in by_category:
                        by_category[cat] = []
                    by_category[cat].append(m)

                section = "**Medications:**\n"
                for category, meds in by_category.items():
                    # Category labels
                    category_labels = {
                        "multiple": "Multiple Uses",
                        "pain_management": "Pain Relief",
                        "cardiovascular": "Heart & Blood Pressure",
                        "diabetes": "Diabetes",
                        "mental_health": "Mental Health",
                        "antibiotics": "Infection",
                        "respiratory": "Breathing",
                        "gastrointestinal": "Digestion",
                        "neurological": "Brain/Nerves",
                        "endocrine": "Hormones",
                        "oncology": "Cancer Treatment",
                        "immunosuppressant": "Immune System",
                        "vitamins_supplements": "Vitamins",
                        "other": "Other"
                    }
                    cat_label = category_labels.get(category, category)
                    section += f"  • {cat_label}: "
                    med_names = []
                    for m in meds[:5]:  # Limit per category
                        med_text = m.get("name") or "Unknown"
                        if m.get("dose"):
                            med_text += f" {m['dose']}"
                        med_names.append(med_text)
                    section += ", ".join(med_names) + "\n"
                section += "\n"

                if not try_add_section(section):
                    return context  # Out of tokens

            # Allergies (critical safety information)
            allergies = profile_data.get("allergies", [])
            if allergies:
                section = "**Allergies:** "
                allergy_list = []
                for a in allergies[:10]:  # Limit to 10
                    allergy_text = a.get("substance") or "Unknown"
                    if a.get("severity"):
                        allergy_text += f" [{a['severity'].upper()}]"
                    if a.get("reaction"):
                        allergy_text += f" - {a['reaction']}"
                    allergy_list.append(allergy_text)
                section += "; ".join(allergy_list) + "\n\n"
                if not try_add_section(section):
                    return context  # Out of tokens

            # Providers (medium priority)
            providers = profile_data.get("providers", [])
            if providers:
                section = "**Healthcare Team:** "
                provider_list = []
                for p in providers[:8]:  # Limit to 8
                    prov_text = p.get("name") or "Unknown"
                    if p.get("specialty"):
                        prov_text += f" ({p['specialty']})"
                    provider_list.append(prov_text)
                section += "; ".join(provider_list) + "\n\n"
                try_add_section(section)  # Optional, won't break if runs out

            # Caregivers (medium priority)
            caregivers = profile_data.get("caregivers", [])
            if caregivers:
                section = "**Caregivers:** "
                caregiver_list = []
                for cg in caregivers[:5]:  # Limit to 5
                    cg_text = cg.get("name") or "Unknown"
                    if cg.get("relationship"):
                        cg_text += f" ({cg['relationship']})"
                    caregiver_list.append(cg_text)
                section += "; ".join(caregiver_list) + "\n\n"
                try_add_section(section)  # Optional

            # Emergency Instructions (if present)
            preferences = profile_data.get("preferences")
            if preferences and preferences.get("emergency_instructions"):
                section = f"**⚠️ EMERGENCY INSTRUCTIONS:** {preferences['emergency_instructions']}\n\n"
                try_add_section(section)  # Optional but important

            return context

        except Exception as e:
            logger.error(f"Error formatting profile context: {e}")
            return ""

    async def format_journal_context_split(
        self,
        session_id: str,
        max_tokens: int = None
    ) -> tuple[str, str]:
        """Format journal context split into older and recent parts for better AI context management.

        Prioritizes recent entries and truncates oldest entries if token limit is exceeded.
        """
        if max_tokens is None:
            max_tokens = ai_config.MAX_JOURNAL_TOKENS

        # Limit entries to prevent memory issues with very active sessions
        # 200 entries is ~6 months of daily entries, which should cover most use cases
        MAX_JOURNAL_ENTRIES = 200

        try:
            entries = self.db.query(JournalEntry).filter(
                JournalEntry.session_id == session_id
            ).order_by(desc(JournalEntry.entry_date)).limit(MAX_JOURNAL_ENTRIES).all()

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

            # Build context with token tracking, prioritizing recent entries
            total_tokens = 0

            # RECENT CONTEXT (last 7 days) - highest priority, built first
            recent_context = ""
            recent_entries_added = []
            if full_detail:
                header = "# Recent Journal Context (Last 7 Days) ⚡\n\n"
                header += "_This is the MOST RECENT journal information. Prioritize this over older context._\n\n"
                header_tokens = self._estimate_tokens(header)

                if total_tokens + header_tokens <= max_tokens:
                    recent_context = header
                    total_tokens += header_tokens

                    # Add recent entries from oldest to newest (reversed full_detail)
                    for e in reversed(full_detail):
                        entry_text = f"**{e.entry_date}** [{e.entry_type.value}] **{e.title}**\n{e.content}\n\n"
                        entry_tokens = self._estimate_tokens(entry_text)

                        if total_tokens + entry_tokens <= max_tokens:
                            recent_entries_added.append(entry_text)
                            total_tokens += entry_tokens
                        else:
                            # Stop adding if we hit the limit
                            break

                    recent_context += "".join(recent_entries_added)

            # OLDER CONTEXT (8+ days ago) - lower priority, only if room remains
            older_context = ""
            if (titles_only or summarized) and total_tokens < max_tokens:
                header = "# Background Journal Context (Older History)\n\n"
                header_tokens = self._estimate_tokens(header)

                if total_tokens + header_tokens <= max_tokens:
                    older_context = header
                    total_tokens += header_tokens

                    # Mid-range entries (8-30 days, summarized) - medium priority
                    if summarized and total_tokens < max_tokens:
                        section_header = "## Previous Entries (8-30 Days Ago)\n\n"
                        section_tokens = self._estimate_tokens(section_header)

                        if total_tokens + section_tokens <= max_tokens:
                            older_context += section_header
                            total_tokens += section_tokens

                            # Add from oldest to newest
                            for e in reversed(summarized):
                                summary = e.content[:1500] + "..." if len(e.content) > 1500 else e.content
                                entry_text = f"**{e.entry_date}** [{e.entry_type.value}] **{e.title}**\n{summary}\n\n"
                                entry_tokens = self._estimate_tokens(entry_text)

                                if total_tokens + entry_tokens <= max_tokens:
                                    older_context += entry_text
                                    total_tokens += entry_tokens
                                else:
                                    break

                    # Health Profile - provides long-term structured memory
                    # This replaces the old "30+ days journal titles" with more useful information
                    if total_tokens < max_tokens:
                        from app.services.openai_service import MAX_PROFILE_TOKENS
                        remaining_tokens = min(max_tokens - total_tokens, MAX_PROFILE_TOKENS)

                        if remaining_tokens > 1000:  # Only add if we have meaningful space
                            profile_context = self._format_profile_context(session_id, remaining_tokens)
                            if profile_context:
                                older_context += profile_context
                                total_tokens += self._estimate_tokens(profile_context)

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

    async def format_journal_context_with_semantic(
        self,
        session_id: str,
        user_message: str,
        max_tokens: int = None
    ) -> tuple[str, str, str]:
        """Format journal context with semantic retrieval for older entries.

        Returns (older_context, recent_context, relevant_context):
        - older_context: Background context (Health Profile + 8-30 day entries)
        - recent_context: Last 7 days full entries
        - relevant_context: Semantically similar older entries matched to user's message
        """
        if max_tokens is None:
            max_tokens = ai_config.MAX_JOURNAL_TOKENS

        # Date-based context keeps its full original budget (50K)
        # Relevant context gets a separate budget (10K) added on top
        older_context, recent_context = await self.format_journal_context_split(
            session_id, max_tokens=max_tokens
        )

        # Semantic retrieval for relevant older entries
        relevant_context = ""
        try:
            from app.services.embedding_service import EmbeddingService
            embedding_service = EmbeddingService(self.db)

            # Collect recent entry IDs for deduplication
            recent_entry_ids = self._get_recent_entry_ids(session_id, days=7)

            similar_entries = await embedding_service.find_similar_entries(
                session_id=session_id,
                query_text=user_message,
                exclude_entry_ids=recent_entry_ids if recent_entry_ids else None,
                top_k=10,
                min_days_old=8
            )

            if similar_entries:
                relevant_budget = ai_config.MAX_RELEVANT_JOURNAL_TOKENS
                header = "# Relevant Past Journal Entries\n\n"
                header += "_These older entries are semantically related to the current question._\n\n"
                parts = [header]
                tokens_used = self._estimate_tokens(header)

                for entry, similarity in similar_entries:
                    days_old = (date.today() - entry.entry_date).days
                    entry_text = (
                        f"**{entry.entry_date}** [{entry.entry_type.value}] "
                        f"**{entry.title}** _({days_old}d ago)_\n"
                        f"{entry.content}\n\n"
                    )
                    entry_tokens = self._estimate_tokens(entry_text)

                    if tokens_used + entry_tokens <= relevant_budget:
                        parts.append(entry_text)
                        tokens_used += entry_tokens
                    else:
                        break

                if len(parts) > 1:
                    relevant_context = "".join(parts)

        except Exception as e:
            logger.warning(f"Semantic retrieval failed for session {session_id}: {e}")

        return older_context, recent_context, relevant_context

    def _get_recent_entry_ids(self, session_id: str, days: int = 7) -> List[int]:
        """Get IDs of entries from the last N days for deduplication."""
        cutoff = date.today() - timedelta(days=days)
        entries = self.db.query(JournalEntry.id).filter(
            JournalEntry.session_id == session_id,
            JournalEntry.entry_date >= cutoff
        ).all()
        return [e.id for e in entries]

    async def create_entry(
        self,
        session_id: str,
        entry_data: JournalEntryCreate,
        created_by: str,
        source_message_ids: Optional[List[int]] = None,
        source_document_id: Optional[int] = None,
        source_audio_id: Optional[int] = None,
        auto_commit: bool = True
    ) -> JournalEntry:
        """Create a new journal entry.

        Args:
            auto_commit: If True (default), commits immediately and generates
                embedding. If False, flushes only (for use within a larger
                transaction) and skips embedding — caller is responsible for
                committing and running embeddings afterward.
        """
        try:
            entry_date = entry_data.entry_date or date.today()

            entry = JournalEntry(
                session_id=session_id,
                entry_date=entry_date,
                entry_type=entry_data.entry_type,
                title=entry_data.title,
                content=entry_data.content,
                created_by=created_by,
                source_message_ids=source_message_ids or [],
                source_document_id=source_document_id,
                source_audio_id=source_audio_id
            )

            self.db.add(entry)
            if auto_commit:
                self.db.commit()
                self.db.refresh(entry)

                # Generate embedding for semantic retrieval (non-fatal)
                try:
                    from app.services.embedding_service import EmbeddingService
                    embedding_service = EmbeddingService(self.db)
                    await embedding_service.embed_journal_entry(entry)
                except Exception as embed_err:
                    logger.warning(f"Failed to generate embedding for entry {entry.id}: {embed_err}")
            else:
                self.db.flush()

            return entry

        except Exception as e:
            logger.error(f"Error creating journal entry: {e}")

            if auto_commit:
                # Only rollback + error-log when we own the transaction
                self.db.rollback()
                try:
                    from app.services.error_logger import log_database_error
                    log_database_error(
                        db=self.db,
                        source="services.journal.create_entry",
                        error=e,
                        session_id=session_id,
                        details={
                            "entry_type": entry_data.entry_type.value if entry_data.entry_type else None,
                            "entry_date": entry_date.isoformat() if entry_date else None,
                            "title": entry_data.title[:100] if entry_data.title else None
                        }
                    )
                except Exception:
                    pass  # Don't let error logging itself crash the app

            # Re-raise so the caller can handle rollback when auto_commit=False
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
            entry.last_edited_by_user_id = user_id  # Track editor for collaborative sessions

            self.db.commit()
            self.db.refresh(entry)

            # Re-embed if content changed (non-fatal)
            if updates.title is not None or updates.content is not None:
                try:
                    from app.services.embedding_service import EmbeddingService
                    embedding_service = EmbeddingService(self.db)
                    await embedding_service.embed_journal_entry(entry)
                except Exception as embed_err:
                    logger.warning(f"Failed to re-embed entry {entry.id}: {embed_err}")

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
        end_date: Optional[date] = None,
        max_dates: int = 90
    ) -> Dict:
        """Get entries grouped by date with pagination by number of distinct dates.

        Returns dict with entries_by_date, total_dates, has_more, and oldest_date.
        Default returns the 90 most recent dates (roughly 3 months).
        """
        try:
            filters = [JournalEntry.session_id == session_id]
            if start_date:
                filters.append(JournalEntry.entry_date >= start_date)
            if end_date:
                filters.append(JournalEntry.entry_date <= end_date)

            # Count total distinct dates for pagination metadata
            total_dates = self.db.query(
                func.count(distinct(JournalEntry.entry_date))
            ).filter(*filters).scalar() or 0

            # Get the N most recent distinct dates
            date_rows = (
                self.db.query(distinct(JournalEntry.entry_date))
                .filter(*filters)
                .order_by(desc(JournalEntry.entry_date))
                .limit(max_dates)
                .all()
            )
            target_dates = [row[0] for row in date_rows]

            if not target_dates:
                return {
                    "entries_by_date": {},
                    "total_dates": 0,
                    "has_more": False,
                    "oldest_date": None,
                }

            # Fetch entries for those dates with a safety cap to bound memory usage.
            # 90 dates × ~20 entries/date = ~1800 typical; cap at 2000 for pathological cases.
            MAX_ENTRIES = 2000
            entries = (
                self.db.query(JournalEntry)
                .filter(
                    JournalEntry.session_id == session_id,
                    JournalEntry.entry_date.in_(target_dates)
                )
                .order_by(desc(JournalEntry.entry_date), desc(JournalEntry.created_at))
                .limit(MAX_ENTRIES)
                .all()
            )

            # Group by date
            grouped = defaultdict(list)
            for entry in entries:
                grouped[entry.entry_date.isoformat()].append(entry)

            return {
                "entries_by_date": dict(grouped),
                "total_dates": total_dates,
                "has_more": total_dates > max_dates,
                "oldest_date": target_dates[-1].isoformat() if target_dates else None,
            }

        except Exception as e:
            logger.error(f"Error getting journal entries: {e}")
            return {"entries_by_date": {}, "total_dates": 0, "has_more": False, "oldest_date": None}

    async def get_entries_for_date(
        self,
        session_id: str,
        target_date: date
    ) -> List[JournalEntry]:
        """Get entries for a specific date (capped at 200 for memory safety)."""
        try:
            entries = self.db.query(JournalEntry).filter(
                and_(
                    JournalEntry.session_id == session_id,
                    JournalEntry.entry_date == target_date
                )
            ).order_by(desc(JournalEntry.created_at)).limit(200).all()

            return entries

        except Exception as e:
            logger.error(f"Error getting entries for date: {e}")
            return []

    # Helper methods

    def _get_recent_entries(self, session_id: str, days: int = 7) -> List[JournalEntry]:
        """Get journal entries from last N days (capped at 200 for memory safety)."""
        cutoff_date = date.today() - timedelta(days=days)
        return self.db.query(JournalEntry).filter(
            and_(
                JournalEntry.session_id == session_id,
                JournalEntry.entry_date >= cutoff_date
            )
        ).order_by(desc(JournalEntry.entry_date)).limit(200).all()

    def _get_document_sourced_entries(self, session_id: str, days: int = 30) -> List[dict]:
        """Get journal entries created from document uploads within the last N days, with filenames.
        Uses created_at (upload date) not entry_date (document date) since old documents
        can be uploaded at any time and multi-part uploads need to find each other."""
        cutoff_date = datetime.now() - timedelta(days=days)
        results = self.db.query(JournalEntry, Document.filename).join(
            Document, JournalEntry.source_document_id == Document.id
        ).filter(
            and_(
                JournalEntry.session_id == session_id,
                JournalEntry.source_document_id.isnot(None),
                JournalEntry.created_at >= cutoff_date
            )
        ).order_by(desc(JournalEntry.created_at)).all()

        return [
            {"entry": entry, "filename": filename}
            for entry, filename in results
        ]

    def _format_document_entries_brief(self, doc_entries: List[dict]) -> str:
        """Format document-sourced journal entries with filenames for multi-part detection"""
        if not doc_entries:
            return "No recent document-sourced journal entries."

        lines = []
        for item in doc_entries:
            entry = item["entry"]
            filename = item["filename"]
            lines.append(f"- {entry.entry_date}: \"{entry.title}\" (from file: {filename})")

        return "\n".join(lines)

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
