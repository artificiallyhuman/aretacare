from openai import OpenAI
from app.core.config import settings
from typing import List, Dict, Optional
import logging
import json

logger = logging.getLogger(__name__)


class OpenAIService:
    """Service for OpenAI API interactions with safety boundaries"""

    SYSTEM_PROMPT = """You are AretaCare, an AI care-advocate assistant helping families navigate complex medical information.

CORE PRINCIPLES:
- You provide clear, structured summaries of medical information
- You translate medical jargon into understandable language
- You help families prepare questions for healthcare teams
- You maintain emotional steadiness with brief acknowledgment of caregiver stress
- You are calm, professional, compassionate but not sentimental

STRICT SAFETY BOUNDARIES - YOU MUST NEVER:
- Diagnose any medical condition
- Recommend or adjust medications
- Predict medical outcomes
- Dispute clinician decisions
- Give medical instructions (dosages, treatments, home care protocols)
- Store or reference patient identifiable information
- Provide therapeutic counseling

YOU MUST ALWAYS:
- Defer final authority to clinicians
- Encourage users to confirm medical meaning with care professionals
- Keep tone calm, respectful, and neutral
- Only summarize information provided - never invent medical facts
- Flag unclear or incomplete information
- Maintain factual neutrality and respect for medical professionals

When providing medical summaries, use this structure:
1. Summary of Update
2. Key Changes or Findings
3. Recommended Questions for the Care Team
4. Family Notes or Next Actions
"""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = "gpt-4-turbo-preview"  # Using GPT-4 for medical accuracy

    def _create_chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Optional[str]:
        """Create chat completion with error handling"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return None

    async def generate_medical_summary(self, medical_text: str, context: List[Dict[str, str]] = None) -> Dict:
        """Generate structured medical summary from provided text"""

        prompt = f"""Please analyze the following medical information and provide a structured summary.

Medical Information:
{medical_text}

Provide your response in the following structure:
1. Summary of Update (2-3 sentences)
2. Key Changes or Findings (bullet points)
3. Recommended Questions for the Care Team (3-5 questions)
4. Family Notes or Next Actions (brief guidance)

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

        response = self._create_chat_completion(messages, temperature=0.5)

        if response:
            return self._parse_medical_summary(response)
        else:
            return {
                "summary": "Unable to generate summary at this time.",
                "key_changes": [],
                "recommended_questions": [],
                "family_notes": "Please consult with your healthcare team directly."
            }

    def _parse_medical_summary(self, response: str) -> Dict:
        """Parse structured summary from response"""
        lines = response.split('\n')

        summary = ""
        key_changes = []
        questions = []
        family_notes = ""

        current_section = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if "summary of update" in line.lower():
                current_section = "summary"
            elif "key changes" in line.lower() or "findings" in line.lower():
                current_section = "changes"
            elif "recommended questions" in line.lower():
                current_section = "questions"
            elif "family notes" in line.lower() or "next actions" in line.lower():
                current_section = "notes"
            elif line.startswith('-') or line.startswith('•') or line[0:2].replace('.', '').isdigit():
                clean_line = line.lstrip('-•0123456789. ').strip()
                if current_section == "changes":
                    key_changes.append(clean_line)
                elif current_section == "questions":
                    questions.append(clean_line)
            else:
                if current_section == "summary":
                    summary += line + " "
                elif current_section == "notes":
                    family_notes += line + " "

        return {
            "summary": summary.strip(),
            "key_changes": key_changes,
            "recommended_questions": questions,
            "family_notes": family_notes.strip()
        }

    async def translate_jargon(self, medical_term: str, context: str = "") -> Dict:
        """Translate medical jargon into plain language"""

        prompt = f"""Please explain the following medical term in simple, clear language:

Term: {medical_term}
{f"Context: {context}" if context else ""}

Provide:
1. A simple, non-alarmist definition
2. Brief context about what this term usually refers to
3. A note encouraging the family to confirm the specific meaning with their healthcare provider

Keep the tone calm and professional."""

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]

        response = self._create_chat_completion(messages, temperature=0.5)

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

    async def generate_conversation_coaching(self, situation: str, context: List[Dict[str, str]] = None) -> Dict:
        """Help families prepare for healthcare conversations"""

        prompt = f"""A family member is preparing for the following healthcare interaction:

{situation}

Please provide:
1. 3-5 concise, respectful questions they could ask
2. 2-3 brief preparation tips

Focus on:
- Encouraging cooperative communication with the care team
- Avoiding implications of clinical judgment
- Keeping questions clear and focused
- Supporting the family's role as advocates, not medical decision-makers"""

        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]

        if context:
            messages.extend(context[-3:])

        messages.append({"role": "user", "content": prompt})

        response = self._create_chat_completion(messages, temperature=0.7)

        if response:
            return self._parse_coaching_response(response)
        else:
            return {
                "suggested_questions": [
                    "Can you help me understand the current care plan?",
                    "What should we watch for or be aware of?",
                    "How can we best support our loved one right now?"
                ],
                "preparation_tips": [
                    "Write down your questions beforehand",
                    "Take notes during the conversation"
                ]
            }

    def _parse_coaching_response(self, response: str) -> Dict:
        """Parse coaching response into structured format"""
        lines = response.split('\n')

        questions = []
        tips = []
        current_section = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if "question" in line.lower():
                current_section = "questions"
            elif "tip" in line.lower() or "preparation" in line.lower():
                current_section = "tips"
            elif line.startswith('-') or line.startswith('•') or line[0:2].replace('.', '').isdigit():
                clean_line = line.lstrip('-•0123456789. ').strip()
                if current_section == "questions":
                    questions.append(clean_line)
                elif current_section == "tips":
                    tips.append(clean_line)

        return {
            "suggested_questions": questions,
            "preparation_tips": tips
        }

    async def chat(self, message: str, conversation_history: List[Dict[str, str]]) -> str:
        """General chat interface with safety boundaries"""

        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]
        messages.extend(conversation_history[-10:])  # Last 10 messages for context
        messages.append({"role": "user", "content": message})

        response = self._create_chat_completion(messages, temperature=0.7)

        return response if response else "I apologize, but I'm unable to respond at this moment. Please try again or consult with your healthcare team directly."


openai_service = OpenAIService()
