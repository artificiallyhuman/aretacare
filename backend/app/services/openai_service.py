from openai import OpenAI
from app.core.config import settings
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class OpenAIService:
    """Service for OpenAI API interactions with safety boundaries"""

    SYSTEM_PROMPT = """You are AretaCare, an AI care-advocate assistant helping families navigate complex medical situations.

CORE PRINCIPLES:
- You provide clear, structured summaries of medical information
- You translate medical jargon into understandable language
- You help families prepare questions for healthcare teams
- You are calm, professional, compassionate but not sentimental

CONTEXT AWARENESS:
- You have access to a daily journal of this caregiver's experience
- The journal contains synthesized insights, not raw conversation logs
- Use journal context to provide continuity and personalized support
- Reference past events naturally when relevant to help the caregiver

STRICT SAFETY BOUNDARIES - YOU MUST NEVER:
- Dispute clinician decisions or recommendations 
- Recommend or adjust medications (even with treatment timeline in journal)
- Give medical instructions (dosages, treatments, home care protocols)
- Provide therapeutic counseling

CRITICAL REMINDER - SAFETY WITH CONTEXT:
Despite having extensive patient history via the journal, your fundamental limitations remain unchanged:
✓ DO: Reference past events to provide continuity
✓ DO: Help identify patterns for discussion with doctors
✓ DO: Suggest questions based on historical trends

✗ NEVER: Use timeline to recommend treatment changes
✗ NEVER: Claim medical expertise based on patient-specific context

Your role remains: Translate, organize, support. NOT: Treat, prescribe, predict.

YOU MUST ALWAYS:
- Defer final authority to clinicians
- Encourage users to confirm medical meaning with care professionals
- Keep tone calm, respectful, and neutral
- Only summarize information provided - never invent medical facts
- Flag unclear or incomplete information
- Maintain factual neutrality and respect for medical professionals
- Only provide the response; don't include commentary before or after the response
"""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = "gpt-5.1"

    def _create_chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.5,
    ) -> Optional[str]:
        """Create chat completion with error handling using Responses API"""
        try:
            response = self.client.responses.create(
                model=self.model,
                input=messages,
                temperature=temperature,
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

        prompt = f"""Please analyze the following medical information and provide a structured summary.

Medical Information:
{medical_text}

Remember to:
- Only summarize what is explicitly stated
- Flag any unclear or ambiguous information
- Avoid making diagnoses or predictions
- Use clear, non-alarmist language
- Encourage confirmation with healthcare providers
"""

        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]

        if context:
            messages.extend(context[-5:])  # Include last 5 messages for context

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages)

        if response:
            return {"content": response}
        else:
            return {"content": "Unable to generate summary at this time. Please consult with your healthcare team directly."}

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

        prompt = f"""Please explain the following medical term in simple, clear language:

**Term:** {medical_term}
{f"**Additional Context:** {context}" if context else ""}

Provide a well-formatted markdown explanation with:

## What It Means

A simple, non-alarmist definition in 1-2 sentences.

## Common Context

Brief explanation (2-3 sentences) about what this term usually refers to in medical care.

## Relevance to This Patient

If the patient's journal contains relevant history, briefly note how this term might relate to their specific situation. If no relevant history exists, acknowledge this is general information.

## Next Steps

A brief note encouraging the family to confirm the specific meaning with their healthcare provider.

Keep the tone calm, professional, and reassuring."""

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT}
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
                "explanation": f"Please ask your healthcare team to explain '{medical_term}' in the context of your loved one's care.",
                "context_note": ""
            }

    async def generate_conversation_coaching(
        self,
        situation: str,
        journal_context: Optional[str] = None
    ) -> Dict:
        """Help families prepare for healthcare conversations with optional journal context"""

        prompt = f"""A family member is preparing for the following healthcare interaction:

{situation}

Please provide conversation coaching in well-formatted markdown with the following structure:

## Questions to Ask

Provide 3-5 concise, respectful questions they could ask. If the patient's journal contains relevant history (past appointments, treatments, test results), tailor questions to reference that context specifically.

Format as a bulleted list with:
- Clear, direct questions
- Brief context in parentheses when relevant to journal history

## Preparation Tips

Provide 2-3 brief, actionable preparation tips. Consider relevant past appointments or treatments from the journal when applicable.

Format as a bulleted list.

Focus on:
- Encouraging cooperative communication with the care team
- Avoiding implications of clinical judgment
- Keeping questions clear and focused
- Supporting the family's role as advocates, not medical decision-makers
- Referencing specific journal history to make guidance more relevant and personalized"""

        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]

        # Add journal context if available
        if journal_context:
            messages.append({"role": "system", "content": f"PATIENT JOURNAL:\n{journal_context}"})

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages)

        if response:
            return {"content": response}
        else:
            return {"content": "Unable to generate coaching at this time. Please write down your questions and concerns for your healthcare team."}

    async def categorize_document(self, extracted_text: str, filename: str) -> Dict:
        """Categorize a document and generate a brief description using AI"""

        # Take first 2000 characters for categorization to avoid token limits
        text_sample = extracted_text[:2000] if extracted_text else ""

        prompt = f"""Analyze this medical document and provide categorization.

Document Filename: {filename}

Document Content Sample:
{text_sample if text_sample else "[No text could be extracted from this document]"}

Please provide your response in this EXACT JSON format (no additional text):
{{
  "category": "<category_value>",
  "description": "<brief description>"
}}

Available categories (use the exact value shown):
- lab_results: Laboratory test results (CBC, metabolic panels, etc.)
- imaging_reports: Radiology reports (X-rays, CT scans, MRIs, ultrasounds)
- clinic_notes: Visit notes, progress notes, consultation notes
- medication_records: Prescription records, medication lists
- discharge_summary: Hospital discharge summaries
- treatment_plan: Treatment plans, care plans
- test_results: Non-lab diagnostic tests (EKG, pulmonary function, etc.)
- referral: Referral letters to specialists
- insurance_billing: Insurance forms, billing statements, EOBs
- consent_form: Consent forms, authorization forms
- care_instructions: Home care instructions, patient education materials
- other: Anything that doesn't fit the above categories

For the description:
- Write 1-2 sentences (max 150 characters)
- Focus on what the document contains (e.g., "Blood work results from 3/15/2024" or "Cardiology consultation note")
- Be specific if dates or key findings are visible
- If no text extracted, describe based on filename"""

        messages = [
            {"role": "system", "content": "You are a medical document classifier. Always respond with valid JSON only."},
            {"role": "user", "content": prompt}
        ]

        response = self._create_chat_completion(messages, temperature=0.3)

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
                    "category": data.get("category", "other"),
                    "description": data.get("description", "Document uploaded")[:200]  # Limit length
                }
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse document categorization response: {e}, Response: {response}")
                return {
                    "category": "other",
                    "description": f"Document: {filename}"[:200]
                }
        else:
            return {
                "category": "other",
                "description": f"Document: {filename}"[:200]
            }

    async def categorize_audio_recording(self, transcribed_text: str, duration: float = None) -> Dict:
        """Categorize an audio recording and generate a brief summary using AI"""

        # Take first 1500 characters for categorization to avoid token limits
        text_sample = transcribed_text[:1500] if transcribed_text else ""

        duration_info = f"Duration: {int(duration)} seconds" if duration else "Duration: Unknown"

        prompt = f"""Analyze this transcribed audio recording and provide categorization.

{duration_info}

Transcription:
{text_sample if text_sample else "[No transcription available]"}

Please provide your response in this EXACT JSON format (no additional text):
{{
  "category": "<category_value>",
  "summary": "<brief summary>"
}}

Available categories (use the exact value shown):
- symptom_update: Recording describing symptoms, pain levels, or physical changes
- appointment_recap: Summary or notes from a medical appointment
- medication_note: Notes about medications, dosages, or medication changes
- question_for_doctor: Questions to ask healthcare providers
- daily_reflection: General reflections on daily health or well-being
- progress_update: Updates on treatment progress or recovery
- side_effects: Reports of medication or treatment side effects
- care_instruction: Notes about care instructions or treatment procedures
- emergency_note: Urgent concerns or emergency-related notes
- family_update: Updates or notes for family members
- treatment_observation: Observations about ongoing treatment
- other: Anything that doesn't fit the above categories

For the summary:
- Write 1-2 sentences (max 150 characters)
- Focus on the main topic or purpose of the recording
- Be specific if key information is mentioned
- If no transcription, write "Audio recording"
"""

        messages = [
            {"role": "system", "content": "You are a medical audio recording classifier. Always respond with valid JSON only."},
            {"role": "user", "content": prompt}
        ]

        response = self._create_chat_completion(messages, temperature=0.3)

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
                    "category": data.get("category", "other"),
                    "summary": data.get("summary", "Audio recording")[:200]  # Limit length
                }
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse audio categorization response: {e}, Response: {response}")
                return {
                    "category": "other",
                    "summary": "Audio recording"
                }
        else:
            return {
                "category": "other",
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

        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]
        messages.extend(conversation_history[-10:])  # Last 10 messages for context
        messages.append({"role": "user", "content": message})

        response = self._create_chat_completion(messages)

        return (
            response
            if response
            else "I apologize, but I'm unable to respond at this moment. Please try again or consult with your healthcare team directly."
        )

    async def chat_with_journal(
        self,
        message: str,
        conversation_history: List[Dict[str, str]],
        journal_context: str,
        document_url: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> str:
        """Chat interface with journal context and native file/image support"""

        # Conversation-specific instructions for concise, formatted responses
        conversation_instructions = """
When responding to conversational messages:
- Be warm but concise (2-4 sentences for simple questions, 1-2 short paragraphs for complex topics)
- Use markdown formatting: **bold** for key terms, bullet lists for multiple points
- Start with a direct answer, then provide brief context if needed
- Reference journal entries naturally when relevant
- Avoid lengthy preambles or repetitive safety disclaimers
"""

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "system", "content": conversation_instructions}
        ]

        # Add journal context as system message
        if journal_context and journal_context.strip() != "# Care Journal\n\nNo journal entries yet.":
            messages.append({
                "role": "system",
                "content": f"Care journal for context:\n\n{journal_context}"
            })

        # Add recent conversation history
        messages.extend(conversation_history[-10:])

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

        response = self._create_chat_completion(messages, temperature=0.7)

        return (
            response
            if response
            else "I apologize, but I'm unable to respond at this moment. Please try again or consult with your healthcare team directly."
        )

    async def transcribe_audio(self, audio_file, filename: str) -> Optional[str]:
        """Transcribe audio file using OpenAI's speech-to-text API"""
        try:
            # OpenAI expects a tuple of (filename, file_content, content_type) for in-memory files
            transcription = self.client.audio.transcriptions.create(
                model="gpt-4o-transcribe",
                file=(filename, audio_file, "audio/mpeg"),
                response_format="text"
            )
            return transcription
        except Exception as e:
            logger.error(f"Audio transcription error: {e}")
            return None

    async def generate_recording_description(self, transcript: str) -> Optional[str]:
        """Generate a concise description of an audio recording from its transcript"""
        try:
            prompt = f"""Summarize the content of this audio transcript in 1–2 sentences. Describe only the events, information, or situation, and do not refer to any people or speakers in any way. Do not use terms like “someone,” “a person,” “they,” “the speaker,” or similar. Focus only on the facts or circumstances described.

Transcript:
{transcript}

Summary:"""

            messages = [
                {"role": "system", "content": "You are a helpful assistant that creates concise summaries."},
                {"role": "user", "content": prompt}
            ]

            response = self._create_chat_completion(messages, temperature=0.3)
            return response if response else "Audio recording"
        except Exception as e:
            logger.error(f"Error generating recording description: {e}")
            return "Audio recording"


openai_service = OpenAIService()
