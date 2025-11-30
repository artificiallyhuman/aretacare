from openai import OpenAI
from app.core.config import settings
from app.config import ai_config
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class OpenAIService:
    """Service for OpenAI API interactions with safety boundaries"""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = ai_config.CHAT_MODEL

    def _create_chat_completion(
        self,
        messages: List[Dict[str, str]],
    ) -> Optional[str]:
        """Create chat completion with error handling using Responses API"""
        try:
            response = self.client.responses.create(
                model=self.model,
                input=messages,
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
            logger.error(f"OpenAI API error: {e}")
            return None

    async def generate_medical_summary(
        self,
        medical_text: str,
        context: List[Dict[str, str]] = None
    ) -> Dict:
        """Generate structured medical summary from provided text"""

        prompt = ai_config.get_medical_summary_prompt(medical_text)

        messages = [{"role": "system", "content": ai_config.SYSTEM_PROMPT}]

        if context:
            messages.extend(context[-ai_config.MAX_SUMMARY_CONTEXT:])

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages)

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

    async def translate_jargon(self, medical_term: str, context: str = "", journal_context: Optional[str] = None) -> Dict:
        """Translate medical jargon into plain language with optional journal context"""

        prompt = ai_config.get_jargon_translation_prompt(medical_term, context)

        messages = [
            {"role": "system", "content": ai_config.SYSTEM_PROMPT}
        ]

        # Add journal context if available
        if journal_context:
            messages.append({"role": "system", "content": f"PATIENT JOURNAL:\n{journal_context}"})

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages)

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
        journal_context: Optional[str] = None
    ) -> Dict:
        """Help families prepare for healthcare conversations with optional journal context"""

        prompt = ai_config.get_conversation_coaching_prompt(situation)

        messages = [{"role": "system", "content": ai_config.SYSTEM_PROMPT}]

        # Add journal context if available
        if journal_context:
            messages.append({"role": "system", "content": f"PATIENT JOURNAL:\n{journal_context}"})

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages)

        if response:
            return {"content": response}
        else:
            return {"content": ai_config.FALLBACK_COACHING}

    async def categorize_document(self, extracted_text: str, filename: str, image_url: str = None) -> Dict:
        """Categorize a document and generate a brief description using AI.

        For images, pass image_url to use GPT vision for better categorization.
        """

        # Take first 2000 characters for categorization to avoid token limits
        text_sample = extracted_text[:2000] if extracted_text else ""

        prompt = ai_config.get_document_categorization_prompt(filename, text_sample)

        messages = [
            {"role": "system", "content": ai_config.DOCUMENT_CLASSIFIER_PROMPT},
        ]

        # Use vision for images to get better categorization
        if image_url:
            messages.append({
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": image_url}
                ]
            })
        else:
            messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages)

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

    async def categorize_audio_recording(self, transcribed_text: str, duration: float = None) -> Dict:
        """Categorize an audio recording and generate a brief summary using AI"""

        # Take first 1500 characters for categorization to avoid token limits
        text_sample = transcribed_text[:1500] if transcribed_text else ""

        prompt = ai_config.get_audio_categorization_prompt(text_sample, duration)

        messages = [
            {"role": "system", "content": ai_config.AUDIO_CLASSIFIER_PROMPT},
            {"role": "user", "content": prompt}
        ]

        response = self._create_chat_completion(messages)

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

    async def chat(self, message: str, conversation_history: List[Dict[str, str]]) -> str:
        """General chat interface with safety boundaries"""

        messages = [{"role": "system", "content": ai_config.SYSTEM_PROMPT}]
        messages.extend(conversation_history[-ai_config.MAX_CONVERSATION_CONTEXT:])
        messages.append({"role": "user", "content": message})

        response = self._create_chat_completion(messages)

        return response if response else ai_config.FALLBACK_CHAT

    async def chat_with_journal(
        self,
        message: str,
        conversation_history: List[Dict[str, str]],
        journal_context: str,
        document_url: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> str:
        """Chat interface with journal context and native file/image support"""

        messages = [
            {"role": "system", "content": ai_config.SYSTEM_PROMPT},
            {"role": "system", "content": ai_config.CONVERSATION_INSTRUCTIONS}
        ]

        # Add journal context as system message
        if journal_context and journal_context.strip() != ai_config.EMPTY_JOURNAL_MARKER:
            messages.append({
                "role": "system",
                "content": f"Care journal for context:\n\n{journal_context}"
            })

        # Add recent conversation history
        messages.extend(conversation_history[-ai_config.MAX_CONVERSATION_CONTEXT:])

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

        response = self._create_chat_completion(messages)

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
            return None

openai_service = OpenAIService()
