"""Read-only lookups for chat (`POST /conversation/message`).

Chat's context holds the last 7 days of journal in full, summaries of days 8-30, the
Health Profile, older entries that seemed related to the message, and the last 30
messages. Anything else (an entry from months ago, a specific date, a name, what a
document or recording said) the model looks up with these function tools.

They are Talk's read tools (`talk_tools.py`) behind chat's own allowlist, and they run
in-process: chat's model call starts from this server, so unlike Talk there is no MCP
endpoint and no token. The care session and user are fixed by the route that builds the
runner, never taken from tool arguments, and every lookup repeats the session predicate.
Results go back through `talk_tools._records` (wrapped as untrusted, images stripped).
"""
import json
import logging
from typing import List, Optional

from sqlalchemy.orm import Session as DBSession

from app.services import talk_tools

logger = logging.getLogger(__name__)

# get_recent_chat is left out: chat already has the last 30 messages. Never add a write
# tool here — chat has no confirmation step, and the check below refuses to load one.
CHAT_TOOL_NAMES = (
    "search_journal",
    "get_journal_entries",
    "get_health_profile",
    "list_documents",
    "get_document_text",
    "list_audio_recordings",
    "get_recording_transcript",
    "get_daily_digest",
)

_writable = [name for name in CHAT_TOOL_NAMES if not talk_tools.TOOLS[name][3]]
if _writable:
    raise RuntimeError(f"Chat lookups must be read-only; not read-only: {_writable}")

MAX_ARGUMENT_CHARS = 2_000

# Responses API function tools. strict is off because the schemas have optional fields.
TOOL_DEFINITIONS: List[dict] = [
    {
        "type": "function",
        "name": name,
        "description": talk_tools.TOOLS[name][0],
        "parameters": talk_tools.TOOLS[name][1],
        "strict": False,
    }
    for name in CHAT_TOOL_NAMES
]

REFUSED = "That tool is not available here. Chat can only read this care session's records."


class ChatToolRunner:
    """Runs the model's lookups for one chat message, in one care session."""

    def __init__(self, db: DBSession, session_id: str, user_id: str):
        self._ctx = talk_tools.ToolContext(db=db, talk_id=None, session_id=session_id, user_id=user_id)
        # Names of the lookups that returned records, in order (the route uses this to
        # tell journal synthesis the reply may restate existing records).
        self.calls: List[str] = []

    def definitions(self) -> List[dict]:
        return TOOL_DEFINITIONS

    async def run(self, name: str, arguments: Optional[str]) -> str:
        """Run one lookup and return its output for the model. Never raises.

        Only tool names are logged: arguments are search text and dates, which can carry
        health details.
        """
        if name not in CHAT_TOOL_NAMES:
            logger.warning("Chat lookup refused: %r is not a chat tool", str(name)[:64])
            return REFUSED
        if arguments is not None and len(arguments) > MAX_ARGUMENT_CHARS:
            return "The tool arguments are too long."
        try:
            args = json.loads(arguments) if arguments else {}
        except (TypeError, ValueError):
            return "The tool arguments were not valid JSON."

        try:
            output = await talk_tools.call_tool(self._ctx, name, args)
            self.calls.append(name)
            logger.info("Chat lookup %s ok", name)
            return output
        except talk_tools.ToolError as e:
            logger.info("Chat lookup %s refused", name)
            return str(e)
        except Exception as e:
            # Type only: a database error's text can include the query's parameters.
            logger.error("Chat lookup %s failed: %s", name, type(e).__name__)
            return "That lookup failed because of a server problem."
        finally:
            # Reads only, so nothing is lost. Ending the transaction returns the pooled
            # connection: send_message releases it before the model call on purpose, and
            # the next model round can take a while.
            try:
                self._ctx.db.rollback()
            except Exception:
                pass
