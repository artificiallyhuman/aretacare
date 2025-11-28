# AI Configuration Guide

This directory contains configuration files for AretaCare's AI functionality. All OpenAI models and prompts are centralized in `ai_config.py` for easy maintenance.

## Quick Start

**To change which AI model the platform uses:**

Edit `ai_config.py` and update the model constants:

```python
# Main conversational AI model
CHAT_MODEL = "gpt-5.1"  # Change to any OpenAI model

# Audio transcription model
TRANSCRIPTION_MODEL = "gpt-4o-transcribe"
```

**To modify AI prompts:**

All prompts are in `ai_config.py`. Simply edit the prompt text directly.

## Configuration Structure

### Model Settings

Located at the top of `ai_config.py`:

- `CHAT_MODEL` - Main model for conversations, summaries, coaching, etc.
- `TRANSCRIPTION_MODEL` - Model for audio transcription

**Note:** All services use the OpenAI Responses API.

### Core Prompts

#### System Prompt (`SYSTEM_PROMPT`)
The foundational prompt defining AretaCare's role and safety boundaries. Used in most AI interactions.

**When to edit:** To change core behavior, tone, or safety guidelines across the entire platform.

#### Conversation Instructions (`CONVERSATION_INSTRUCTIONS`)
Additional instructions for conversational responses (formatting, length, style).

**When to edit:** To adjust how the AI formats responses in chat.

### Task-Specific Prompts

Each feature has dedicated prompts and functions:

| Feature | Function/Constant | Purpose |
|---------|------------------|---------|
| Medical Summary | `get_medical_summary_prompt()` | Summarize medical text |
| Jargon Translation | `get_jargon_translation_prompt()` | Explain medical terms |
| Conversation Coaching | `get_conversation_coaching_prompt()` | Help prepare for appointments |
| Document Categorization | `get_document_categorization_prompt()` | Classify uploaded documents |
| Audio Categorization | `get_audio_categorization_prompt()` | Classify voice recordings |
| Journal Synthesis | `JOURNAL_SYNTHESIS_PROMPT` | Generate journal entries from conversations |
| Daily Plan | `DAILY_PLAN_SYSTEM_PROMPT` | Generate daily care plans |

### Categories

Document and audio categories are defined in:
- `DOCUMENT_CATEGORIES` - 12 document types (lab results, imaging reports, etc.)
- `AUDIO_CATEGORIES` - 12 audio types (symptom updates, appointment recaps, etc.)

**When to edit:** To add new categories or change category descriptions.

### Fallback Messages

Default responses when AI calls fail:
- `FALLBACK_SUMMARY` - Medical summary failure
- `FALLBACK_JARGON_TRANSLATION` - Translation failure
- `FALLBACK_COACHING` - Coaching failure
- `FALLBACK_CHAT` - Chat failure
- `FALLBACK_DOCUMENT_CATEGORY` - Document categorization failure
- `FALLBACK_AUDIO_CATEGORY` - Audio categorization failure

## Common Modifications

### Change AI Model

```python
# Switch to a different OpenAI model
CHAT_MODEL = "gpt-4o"  # or "gpt-4", "gpt-3.5-turbo", etc.
```

### Modify Safety Guidelines

Edit the `SYSTEM_PROMPT` to change safety boundaries:

```python
SYSTEM_PROMPT = """You are AretaCare...

STRICT SAFETY BOUNDARIES - YOU MUST NEVER:
- [Add or modify safety rules here]
...
"""
```

### Add New Document Category

1. Add to `DOCUMENT_CATEGORIES`:
```python
DOCUMENT_CATEGORIES = {
    # ... existing categories ...
    "new_category": "Description of new category"
}
```

2. Update the corresponding database enum in `backend/app/models/document.py`

### Change Prompt Wording

Find the prompt in `ai_config.py` and edit directly:

```python
def get_jargon_translation_prompt(medical_term: str, context: str = "") -> str:
    """Generate prompt for medical jargon translation"""
    return f"""Please explain the following medical term...

    [Modify instructions here]
    """
```

## Testing Changes

After modifying `ai_config.py`:

1. **Local Development:**
   ```bash
   docker compose restart backend
   ```

2. **Production:**
   - Commit changes to git
   - Push to your deployment platform (e.g., Render)
   - The backend will automatically restart with new settings

## Best Practices

1. **Version Control:** Always commit prompt changes to git with clear descriptions
2. **Test Thoroughly:** Test AI responses after changing prompts or models
3. **Safety First:** Never remove safety boundaries from prompts
4. **Backup:** Keep previous working prompts in comments when making major changes
5. **Document:** Add comments explaining why specific wording is important

## Example: Switching Models

To switch from GPT-5.1 to GPT-4:

```python
# Before
CHAT_MODEL = "gpt-5.1"

# After
CHAT_MODEL = "gpt-4"
```

Restart backend:
```bash
docker compose restart backend
```

Test key features:
- Send a conversation message
- Translate medical jargon
- Generate a daily plan
- Upload a document (test categorization)

## Troubleshooting

**Issue:** Changes not taking effect

**Solution:** Restart the backend service. Python imports are cached.

---

**Issue:** AI responses are too verbose/brief

**Solution:** Modify the relevant prompt to adjust response length and style. Edit prompts in `ai_config.py` to be more specific about desired output format.

---

## Support

For questions or issues:
- Check the main project `README.md`
- Review `docs/SAFETY_GUIDELINES.md` before modifying safety-related prompts
- Open an issue on GitHub
