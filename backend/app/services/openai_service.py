from openai import OpenAI
from app.core.config import settings
from app.config import ai_config
from typing import List, Dict, Optional, Any
import logging
import time

logger = logging.getLogger(__name__)


def log_api_call(
    feature: str,
    input_tokens: int,
    output_tokens: int,
    success: bool,
    model: str,
    response_time_ms: int,
    user_id: Optional[str] = None,
    error_message: Optional[str] = None
):
    """Log an API call to the database for admin monitoring"""
    try:
        from app.core.database import SessionLocal
        from app.models.api_log import ApiLog

        db = SessionLocal()
        try:
            api_log = ApiLog(
                feature=feature,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                success=success,
                model=model,
                response_time_ms=response_time_ms,
                user_id=user_id,
                error_message=error_message
            )
            db.add(api_log)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to log API call: {e}")

# Token budgets (total: 128,000)
# - System prompts: ~1,500 tokens (fixed)
# - Conversation history: up to 20,000 tokens
# - Current message + media: up to 50,000 tokens (20MB file limit)
# - Journal context: up to 50,000 tokens
# - Buffer: ~6,500 tokens
MAX_CONVERSATION_TOKENS = 20000
MAX_CURRENT_MESSAGE_TOKENS = 50000  # Includes document/audio if attached
MAX_JOURNAL_TOKENS = 50000  # Configured in ai_config.py


def estimate_tokens(text: str) -> int:
    """Estimate token count from text (roughly 1 token per 4 characters)"""
    if not text:
        return 0
    return len(text) // 4


def estimate_message_tokens(message: Dict[str, Any]) -> int:
    """Estimate tokens for a single message, handling multi-modal content"""
    content = message.get("content", "")
    if isinstance(content, str):
        return estimate_tokens(content)
    elif isinstance(content, list):
        # Multi-modal message - only count text parts
        total = 0
        for part in content:
            if isinstance(part, dict):
                if part.get("type") in ("text", "input_text"):
                    total += estimate_tokens(part.get("text", ""))
                # Images/files are handled by the API separately, don't count here
        return total
    return 0


class OpenAIService:
    """Service for OpenAI API interactions with safety boundaries"""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = ai_config.CHAT_MODEL

    def _create_chat_completion(
        self,
        messages: List[Dict[str, str]],
        feature: str = "unknown",
        user_id: Optional[str] = None,
    ) -> Optional[str]:
        """Create chat completion with error handling using Responses API"""
        start_time = time.time()
        input_tokens = 0
        output_tokens = 0

        try:
            response = self.client.responses.create(
                model=self.model,
                input=messages,
            )

            # Extract token usage from response
            if hasattr(response, "usage") and response.usage:
                input_tokens = getattr(response.usage, "input_tokens", 0) or 0
                output_tokens = getattr(response.usage, "output_tokens", 0) or 0

            response_time_ms = int((time.time() - start_time) * 1000)

            # Log successful API call
            log_api_call(
                feature=feature,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                success=True,
                model=self.model,
                response_time_ms=response_time_ms,
                user_id=user_id
            )

            # Prefer the convenience property if available
            text = getattr(response, "output_text", None)
            if text is not None:
                return text

            # Fallback: extract first text segment from output
            if getattr(response, "output", None):
                first_item = response.output[0]
                if getattr(first_item, "content", None):
                    first_content = first_item.content[0]
                    return getattr(first_content, "text", None)

            return None

        except Exception as e:
            response_time_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e)[:500]  # Truncate error message

            # Log failed API call
            log_api_call(
                feature=feature,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                success=False,
                model=self.model,
                response_time_ms=response_time_ms,
                user_id=user_id,
                error_message=error_msg
            )

            logger.error(f"OpenAI API error: {e}")

            # Log to database for admin visibility
            try:
                from app.services.error_logger import log_error_standalone
                log_error_standalone(
                    source="services.openai._create_chat_completion",
                    error=e,
                    level="ERROR",
                    details={"model": self.model, "message_count": len(messages)}
                )
            except Exception:
                pass  # Don't let error logging crash the app

            return None

    async def generate_medical_summary(
        self,
        medical_text: str,
        context: List[Dict[str, str]] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """Generate structured medical summary from provided text"""

        prompt = ai_config.get_medical_summary_prompt(medical_text)

        messages = [{"role": "system", "content": ai_config.SYSTEM_PROMPT}]

        if context:
            messages.extend(context[-ai_config.MAX_SUMMARY_CONTEXT:])

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages, feature="medical_summary", user_id=user_id)

        if response:
            return {"content": response}
        else:
            return {"content": ai_config.FALLBACK_SUMMARY}

    def _parse_medical_summary(self, response: str) -> Dict:
        """Parse structured summary from response, preserving markdown"""
        lines = response.split('\n')

        summary = []
        key_changes = []
        questions = []
        family_notes = []

        current_section = None
        current_item = []

        def is_bullet_start(line):
            """Check if line starts a new bullet point"""
            stripped = line.lstrip()
            return (stripped.startswith('-') or
                   stripped.startswith('•') or
                   (len(stripped) > 0 and stripped[0].isdigit() and '.' in stripped[:3]))

        def save_current_item():
            """Save accumulated item to appropriate section"""
            if not current_item:
                return
            content = '\n'.join(current_item).strip()
            if not content:
                return

            if current_section == "changes":
                key_changes.append(content)
            elif current_section == "questions":
                questions.append(content)

        for line in lines:
            stripped_line = line.strip()
            if not stripped_line:
                continue

            lower_line = stripped_line.lower()

            # Check for section headers
            if "summary of update" in lower_line or (lower_line == "summary" or lower_line.startswith("## summary")):
                save_current_item()
                current_item = []
                current_section = "summary"
                continue
            elif "key changes" in lower_line or "findings" in lower_line:
                save_current_item()
                current_item = []
                current_section = "changes"
                continue
            elif "recommended questions" in lower_line or lower_line.startswith("## questions"):
                save_current_item()
                current_item = []
                current_section = "questions"
                continue
            elif "family notes" in lower_line or "next actions" in lower_line:
                save_current_item()
                current_item = []
                current_section = "notes"
                continue

            # Handle content based on section
            if current_section == "summary":
                summary.append(stripped_line)
            elif current_section == "notes":
                family_notes.append(stripped_line)
            elif current_section in ["changes", "questions"]:
                # If this is a new bullet point, save previous and start new
                if is_bullet_start(line):
                    save_current_item()
                    current_item = [stripped_line]
                else:
                    # Continue accumulating content for current bullet
                    current_item.append(stripped_line)

        # Save any remaining item
        save_current_item()

        return {
            "summary": '\n'.join(summary).strip(),
            "key_changes": key_changes,
            "recommended_questions": questions,
            "family_notes": '\n'.join(family_notes).strip()
        }

    async def translate_jargon(
        self,
        medical_term: str,
        context: str = "",
        journal_context: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """Translate medical jargon into plain language with optional journal context"""

        prompt = ai_config.get_jargon_translation_prompt(medical_term, context)

        messages = [
            {"role": "system", "content": ai_config.SYSTEM_PROMPT}
        ]

        # Add journal context if available
        if journal_context:
            messages.append({"role": "system", "content": f"PATIENT JOURNAL:\n{journal_context}"})

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages, feature="jargon_translator", user_id=user_id)

        if response:
            return {
                "term": medical_term,
                "explanation": response,
                "context_note": "Please confirm this explanation with your healthcare provider for your specific situation."
            }
        else:
            return {
                "term": medical_term,
                "explanation": ai_config.FALLBACK_JARGON_TRANSLATION.format(term=medical_term),
                "context_note": ""
            }

    async def generate_conversation_coaching(
        self,
        situation: str,
        journal_context: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """Help families prepare for healthcare conversations with optional journal context"""

        prompt = ai_config.get_conversation_coaching_prompt(situation)

        messages = [{"role": "system", "content": ai_config.SYSTEM_PROMPT}]

        # Add journal context if available
        if journal_context:
            messages.append({"role": "system", "content": f"PATIENT JOURNAL:\n{journal_context}"})

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages, feature="conversation_coach", user_id=user_id)

        if response:
            return {"content": response}
        else:
            return {"content": ai_config.FALLBACK_COACHING}

    async def categorize_document(
        self,
        filename: str,
        content_type: str,
        document_url: str,
        extracted_text: str = "",
        user_id: Optional[str] = None
    ) -> Dict:
        """Categorize a document and generate a brief description using AI.

        Uses GPT-5.2's native file support to analyze the actual document content.
        Falls back to extracted text if document URL is not available.
        """

        prompt = ai_config.get_document_categorization_prompt(filename, extracted_text)

        messages = [
            {"role": "system", "content": ai_config.DOCUMENT_CLASSIFIER_PROMPT},
        ]

        # Use native file/image support for better categorization
        if document_url:
            content_items = [{"type": "input_text", "text": prompt}]

            if content_type.startswith("image/"):
                # Use input_image for images
                content_items.append({
                    "type": "input_image",
                    "image_url": document_url
                })
            else:
                # Use input_file for PDFs, text files, etc.
                content_items.append({
                    "type": "input_file",
                    "file_url": document_url
                })

            messages.append({
                "role": "user",
                "content": content_items
            })
        else:
            # Fallback to text-only if no URL (shouldn't happen normally)
            messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages, feature="document_categorization", user_id=user_id)

        if response:
            try:
                # Try to parse JSON response
                import json
                # Strip any markdown code blocks if present
                cleaned_response = response.strip()
                if cleaned_response.startswith("```"):
                    # Remove markdown code blocks
                    cleaned_response = cleaned_response.split("```")[1]
                    if cleaned_response.startswith("json"):
                        cleaned_response = cleaned_response[4:]
                    cleaned_response = cleaned_response.strip()

                data = json.loads(cleaned_response)
                return {
                    "category": data.get("category", ai_config.FALLBACK_DOCUMENT_CATEGORY),
                    "description": data.get("description", "Document uploaded")[:200]  # Limit length
                }
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse document categorization response: {e}, Response: {response}")
                return {
                    "category": ai_config.FALLBACK_DOCUMENT_CATEGORY,
                    "description": f"Document: {filename}"[:200]
                }
        else:
            return {
                "category": ai_config.FALLBACK_DOCUMENT_CATEGORY,
                "description": f"Document: {filename}"[:200]
            }

    async def categorize_audio_recording(
        self,
        transcribed_text: str,
        duration: float = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """Categorize an audio recording and generate a brief summary using AI"""

        # Audio is chunked for transcription (20min chunks), so total text can be large.
        # Categorization uses 128K model. Allow up to ~100K tokens (~400K chars).
        max_chars = 400000
        text_sample = transcribed_text[:max_chars] if transcribed_text else ""

        prompt = ai_config.get_audio_categorization_prompt(text_sample, duration)

        messages = [
            {"role": "system", "content": ai_config.AUDIO_CLASSIFIER_PROMPT},
            {"role": "user", "content": prompt}
        ]

        response = self._create_chat_completion(messages, feature="audio_categorization", user_id=user_id)

        if response:
            try:
                # Try to parse JSON response
                import json
                # Strip any markdown code blocks if present
                cleaned_response = response.strip()
                if cleaned_response.startswith("```"):
                    # Remove markdown code blocks
                    cleaned_response = cleaned_response.split("```")[1]
                    if cleaned_response.startswith("json"):
                        cleaned_response = cleaned_response[4:]
                    cleaned_response = cleaned_response.strip()

                data = json.loads(cleaned_response)
                return {
                    "category": data.get("category", ai_config.FALLBACK_AUDIO_CATEGORY),
                    "summary": data.get("summary", "Audio recording")[:200]  # Limit length
                }
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse audio categorization response: {e}, Response: {response}")
                return {
                    "category": ai_config.FALLBACK_AUDIO_CATEGORY,
                    "summary": "Audio recording"
                }
        else:
            return {
                "category": ai_config.FALLBACK_AUDIO_CATEGORY,
                "summary": "Audio recording"
            }

    def _parse_coaching_response(self, response: str) -> Dict:
        """Parse coaching response into structured format, preserving markdown"""
        lines = response.split('\n')

        questions = []
        tips = []
        current_section = None
        current_item = []

        def is_bullet_start(line):
            """Check if line starts a new bullet point"""
            stripped = line.lstrip()
            return (stripped.startswith('-') or
                   stripped.startswith('•') or
                   (len(stripped) > 0 and stripped[0].isdigit() and '.' in stripped[:3]))

        def save_current_item():
            """Save accumulated item to appropriate section"""
            if not current_item:
                return
            content = '\n'.join(current_item).strip()
            if not content:
                return

            if current_section == "questions":
                questions.append(content)
            elif current_section == "tips":
                tips.append(content)

        for line in lines:
            stripped_line = line.strip()
            if not stripped_line:
                continue

            lower_line = stripped_line.lower()

            # Check for section headers
            if "question" in lower_line and not is_bullet_start(line):
                save_current_item()
                current_item = []
                current_section = "questions"
                continue
            elif ("tip" in lower_line or "preparation" in lower_line) and not is_bullet_start(line):
                save_current_item()
                current_item = []
                current_section = "tips"
                continue

            # Handle bullet points
            if current_section in ["questions", "tips"]:
                if is_bullet_start(line):
                    save_current_item()
                    current_item = [stripped_line]
                else:
                    current_item.append(stripped_line)

        # Save any remaining item
        save_current_item()

        return {
            "suggested_questions": questions,
            "preparation_tips": tips
        }

    async def chat(
        self,
        message: str,
        conversation_history: List[Dict[str, str]],
        user_id: Optional[str] = None
    ) -> str:
        """General chat interface with safety boundaries"""

        messages = [{"role": "system", "content": ai_config.SYSTEM_PROMPT}]
        messages.extend(conversation_history[-ai_config.MAX_CONVERSATION_CONTEXT:])
        messages.append({"role": "user", "content": message})

        response = self._create_chat_completion(messages, feature="chat", user_id=user_id)

        return response if response else ai_config.FALLBACK_CHAT

    async def chat_with_journal(
        self,
        message: str,
        conversation_history: List[Dict[str, str]],
        older_journal_context: str = "",
        recent_journal_context: str = "",
        document_url: Optional[str] = None,
        document_type: Optional[str] = None,
        # Legacy parameter for backwards compatibility
        journal_context: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> str:
        """Chat interface with journal context and native file/image support

        Optimized context structure:
        1. System prompts (rules and instructions)
        2. Older journal (8+ days) - as user message (context, not rules)
        3. Recent conversation (last 15 messages)
        4. Recent journal (last 7 days) - as user message (prioritized context)
        5. Immediate context reminder (system - rules for interpreting next message)
        6. Current user message
        """

        messages = [
            {"role": "system", "content": ai_config.SYSTEM_PROMPT},
            {"role": "system", "content": ai_config.CONVERSATION_INSTRUCTIONS}
        ]

        # Add older journal context as assistant message (system-provided knowledge, not user input)
        if older_journal_context and older_journal_context.strip():
            messages.append({
                "role": "assistant",
                "content": older_journal_context
            })

        # Add recent conversation history with token-based truncation
        # Start with most recent messages and work backwards until we hit token limit
        recent_history = conversation_history[-ai_config.MAX_CONVERSATION_CONTEXT:]
        total_tokens = 0
        truncated_history = []

        # Process from newest to oldest, keeping track of tokens
        for msg in reversed(recent_history):
            msg_tokens = estimate_message_tokens(msg)
            if total_tokens + msg_tokens <= MAX_CONVERSATION_TOKENS:
                truncated_history.insert(0, msg)  # Insert at beginning to maintain order
                total_tokens += msg_tokens
            else:
                # Stop adding older messages once we hit the limit
                break

        messages.extend(truncated_history)

        # Add recent journal context as assistant message (system-provided knowledge, not user input)
        if recent_journal_context and recent_journal_context.strip():
            messages.append({
                "role": "assistant",
                "content": recent_journal_context
            })

        # Highlight the immediate context (last exchange) to help AI connect follow-ups
        if conversation_history and len(conversation_history) > 0:
            last_message = conversation_history[-1]
            if last_message.get("role") == "assistant":
                messages.append({
                    "role": "system",
                    "content": f"---\n⚡ IMMEDIATE CONTEXT - Your last message to the user:\n{last_message.get('content', '')}\n\nThe user is now responding to THIS message. If they say 'yes', 'sure', 'okay', 'go ahead', etc., they are agreeing to what you suggested above.\n---"
                })

        # Explicitly mark the current message as the one to respond to
        messages.append({
            "role": "system",
            "content": "---\n⚡ The following is the user's CURRENT MESSAGE that you must respond to:\n---"
        })

        # Add current message with file/image support
        if document_url and document_type:
            # Multi-modal message with file or image
            content_items = [{"type": "input_text", "text": message}]

            if document_type == "image":
                content_items.append({
                    "type": "input_image",
                    "image_url": document_url
                })
            else:  # document (PDF, text, etc.)
                content_items.append({
                    "type": "input_file",
                    "file_url": document_url
                })

            messages.append({
                "role": "user",
                "content": content_items
            })
        else:
            # Text-only message
            messages.append({"role": "user", "content": message})

        response = self._create_chat_completion(messages, feature="conversation", user_id=user_id)

        return response if response else ai_config.FALLBACK_CHAT

    async def transcribe_audio(self, audio_file, filename: str) -> Optional[str]:
        """Transcribe audio file using OpenAI's speech-to-text API"""
        try:
            # OpenAI expects a tuple of (filename, file_content, content_type) for in-memory files
            transcription = self.client.audio.transcriptions.create(
                model=ai_config.TRANSCRIPTION_MODEL,
                file=(filename, audio_file, "audio/mpeg"),
                response_format="text"
            )
            return transcription
        except Exception as e:
            logger.error(f"Audio transcription error: {e}")

            # Log to database for admin visibility
            try:
                from app.services.error_logger import log_error_standalone
                log_error_standalone(
                    source="services.openai.transcribe_audio",
                    error=e,
                    level="ERROR",
                    details={"filename": filename}
                )
            except Exception:
                pass  # Don't let error logging crash the app

            return None

openai_service = OpenAIService()
