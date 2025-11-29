"""
AI Model Configuration and Prompts

This file contains all OpenAI model settings and prompt templates used throughout the application.
Modify this file to change AI behavior, models, or prompt wording.
"""

# ============================================================================
# MODEL SETTINGS
# ============================================================================

# Main conversational AI model
CHAT_MODEL = "gpt-5.1"

# Audio transcription model
TRANSCRIPTION_MODEL = "gpt-4o-transcribe"


# ============================================================================
# CORE SYSTEM PROMPT
# ============================================================================

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


# ============================================================================
# CONVERSATION-SPECIFIC INSTRUCTIONS
# ============================================================================

CONVERSATION_INSTRUCTIONS = """
When responding to conversational messages:
- Be warm but concise (2-4 sentences for simple questions, 1-2 short paragraphs for complex topics)
- Use markdown formatting: **bold** for key terms, bullet lists for multiple points
- Start with a direct answer, then provide brief context if needed
- Reference journal entries naturally when relevant
- Avoid lengthy preambles or repetitive safety disclaimers
"""


# ============================================================================
# TASK-SPECIFIC PROMPTS
# ============================================================================

def get_medical_summary_prompt(medical_text: str) -> str:
    """Generate prompt for medical text summarization"""
    return f"""Please analyze the following medical information and provide a structured summary.

Medical Information:
{medical_text}

Remember to:
- Only summarize what is explicitly stated
- Flag any unclear or ambiguous information
- Avoid making diagnoses or predictions
- Use clear, non-alarmist language
- Encourage confirmation with healthcare providers
"""


def get_jargon_translation_prompt(medical_term: str, context: str = "") -> str:
    """Generate prompt for medical jargon translation"""
    return f"""Please explain the following medical term in simple, clear language:

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


def get_conversation_coaching_prompt(situation: str) -> str:
    """Generate prompt for conversation coaching"""
    return f"""A family member is preparing for the following healthcare interaction:

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


# ============================================================================
# DOCUMENT CATEGORIZATION
# ============================================================================

DOCUMENT_CATEGORIES = {
    "lab_results": "Results from analyzing samples taken from the body: blood tests (CBC, metabolic panel, A1C, cholesterol), COVID/flu/strep rapid tests, urinalysis, stool samples, cultures, biopsies, pathology reports, genetic/DNA tests, allergy panels, hormone levels, tumor markers",
    "imaging_reports": "Visual scans of the body: X-rays, CT scans, MRIs, ultrasounds, mammograms, PET scans, bone density scans (DEXA), echocardiograms, fluoroscopy",
    "clinic_notes": "Notes from medical visits: office visit summaries, progress notes, consultation notes, telehealth visit notes, specialist evaluations, history and physical (H&P)",
    "medication_records": "Medication-related documents: prescription records, medication lists, pharmacy printouts, medication reconciliation forms, prior authorization for medications",
    "discharge_summary": "Hospital departure documents: discharge summaries, after-visit summaries (AVS), hospital stay reports, post-operative instructions from inpatient stays",
    "treatment_plan": "Planned care documents: treatment plans, care plans, therapy schedules, chemotherapy protocols, radiation therapy plans, rehabilitation plans, disease management plans",
    "test_results": "Results from functional/diagnostic tests (not lab samples): EKG/ECG, stress tests, pulmonary function tests (PFT), sleep studies, hearing tests (audiograms), vision tests, nerve conduction studies, EEG, cardiac monitoring (Holter), colonoscopy/endoscopy reports",
    "referral": "Provider-to-provider documents: referral letters, specialist referrals, second opinion requests, transfer summaries",
    "insurance_billing": "Financial and insurance documents: insurance forms, billing statements, EOBs (Explanation of Benefits), itemized bills, prior authorization forms, claims, medical receipts",
    "consent_form": "Authorization documents: informed consent forms, procedure consent, HIPAA forms, release of information, advance directives, DNR orders, power of attorney",
    "care_instructions": "Educational/instruction documents for patients: home care instructions, wound care guides, physical therapy exercises, dietary guidelines, post-procedure instructions, patient education handouts",
    "other": "Documents that don't fit the above categories"
}


def get_document_categorization_prompt(filename: str, text_sample: str) -> str:
    """Generate prompt for document categorization"""
    categories_text = "\n".join([f"- {key}: {desc}" for key, desc in DOCUMENT_CATEGORIES.items()])

    return f"""Analyze this medical document and provide categorization.

Document Filename: {filename}

Document Content Sample:
{text_sample if text_sample else "[No text could be extracted from this document]"}

Please provide your response in this EXACT JSON format (no additional text):
{{
  "category": "<category_value>",
  "description": "<brief description>"
}}

Available categories (use the exact value shown):
{categories_text}

For the description:
- Write 2-3 sentences (max 200 characters)
- Focus on what the document contains (e.g., "Blood work results from 3/15/2024" or "Cardiology consultation note")
- Be specific if dates or key findings are visible
- If no text extracted, describe based on filename"""


# ============================================================================
# AUDIO RECORDING CATEGORIZATION
# ============================================================================

AUDIO_CATEGORIES = {
    "symptom_update": "Recording describing symptoms, pain levels, or physical changes",
    "appointment_recap": "Summary or notes from a medical appointment",
    "medication_note": "Notes about medications, dosages, or medication changes",
    "question_for_doctor": "Questions to ask healthcare providers",
    "daily_reflection": "General reflections on daily health or well-being",
    "progress_update": "Updates on treatment progress or recovery",
    "side_effects": "Reports of medication or treatment side effects",
    "care_instruction": "Notes about care instructions or treatment procedures",
    "emergency_note": "Urgent concerns or emergency-related notes",
    "family_update": "Updates or notes for family members",
    "treatment_observation": "Observations about ongoing treatment",
    "other": "Anything that doesn't fit the above categories"
}


def get_audio_categorization_prompt(text_sample: str, duration: float = None) -> str:
    """Generate prompt for audio recording categorization"""
    categories_text = "\n".join([f"- {key}: {desc}" for key, desc in AUDIO_CATEGORIES.items()])
    duration_info = f"Duration: {int(duration)} seconds" if duration else "Duration: Unknown"

    return f"""Analyze this transcribed audio recording and provide categorization.

{duration_info}

Transcription:
{text_sample if text_sample else "[No transcription available]"}

Please provide your response in this EXACT JSON format (no additional text):
{{
  "category": "<category_value>",
  "summary": "<brief summary>"
}}

Available categories (use the exact value shown):
{categories_text}

For the summary:
- Write 1-2 sentences (max 150 characters)
- Describe only the events, information, or situation
- Do NOT refer to any people or speakers in any way
- Do NOT use terms like "someone," "a person," "they," "the speaker," or similar
- Focus only on the facts or circumstances described
- If no transcription, write "Audio recording"
"""


# ============================================================================
# CLASSIFIER SYSTEM PROMPTS
# ============================================================================

DOCUMENT_CLASSIFIER_PROMPT = "You are a medical document classifier. Always respond with valid JSON only."

AUDIO_CLASSIFIER_PROMPT = "You are a medical audio recording classifier. Always respond with valid JSON only."


# ============================================================================
# FALLBACK MESSAGES
# ============================================================================

FALLBACK_SUMMARY = "Unable to generate summary at this time. Please consult with your healthcare team directly."

FALLBACK_JARGON_TRANSLATION = "Please ask your healthcare team to explain '{term}' in the context of your loved one's care."

FALLBACK_COACHING = "Unable to generate coaching at this time. Please write down your questions and concerns for your healthcare team."

FALLBACK_CHAT = "I apologize, but I'm unable to respond at this moment. Please try again or consult with your healthcare team directly."

FALLBACK_DOCUMENT_CATEGORY = "other"

FALLBACK_AUDIO_CATEGORY = "other"


# ============================================================================
# JOURNAL SYNTHESIS
# ============================================================================

JOURNAL_SYNTHESIS_PROMPT = """You are creating journal entries for a caregiver's daily diary. For EVERY conversation, create at least one journal entry capturing what was discussed.

Entry types to use:
- MEDICAL_UPDATE: Any medical information, test results, symptoms, conditions
- TREATMENT_CHANGE: Medication changes, new therapies, care plan adjustments
- APPOINTMENT: Upcoming or past medical appointments
- QUESTION: Important questions the caregiver needs answered
- INSIGHT: Observations, patterns, concerns about the journey
- MILESTONE: Significant moments in the care journey

CONTENT DETAIL GUIDELINES:
- For IMPORTANT topics (test results, new diagnoses, treatment changes): Write detailed entries with context and specifics
- For ROUTINE topics (general questions, simple updates): Write brief, concise entries (1-2 sentences)
- For SIGNIFICANT moments (milestones, major decisions): Write thoughtful entries capturing the emotional and practical aspects

IMPORTANT: Create entries for all substantive conversations. Only skip entries for pure greetings like "hi" or "thanks"."""


# ============================================================================
# DAILY PLAN GENERATION
# ============================================================================

DAILY_PLAN_SYSTEM_PROMPT = """You are AretaCare, an AI care advocate assistant. Your role is to create a concise daily plan for families managing medical care.

TASK: Create a daily plan for today based on the provided context (journal entries, conversations, documents, and previous plans).

STRICT REQUIREMENTS:
- Keep the plan CONCISE and not overwhelming (aim for 150-250 words total)
- Focus on TODAY's priorities, not long-term planning
- Include 3 sections:
  1. **Today's Priorities** (2-4 key items for today)
  2. **Important Reminders** (2-3 critical things to remember)
  3. **Questions for Care Team** (2-3 questions to ask at next appointment)

SAFETY BOUNDARIES - YOU MUST NEVER:
- Diagnose any medical condition
- Recommend or adjust medications
- Predict medical outcomes
- Dispute clinician decisions
- Give medical instructions

ALWAYS:
- Defer to medical professionals
- Focus on practical, actionable items
- Keep tone calm and supportive
- Base recommendations on information provided, never invent medical facts

Format the plan in markdown with clear sections and bullet points for easy reading."""


# ============================================================================
# CONTEXT SETTINGS
# ============================================================================

# Maximum number of conversation messages to include in context
MAX_CONVERSATION_CONTEXT = 10

# Maximum number of messages for medical summary context
MAX_SUMMARY_CONTEXT = 5

# Maximum tokens for journal context (approximate: 1 token ≈ 4 characters)
MAX_JOURNAL_TOKENS = 10000

# Journal context marker (used to detect empty journal)
EMPTY_JOURNAL_MARKER = "# Care Journal\n\nNo journal entries yet."
