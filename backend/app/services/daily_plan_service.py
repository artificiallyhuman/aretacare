from openai import AsyncOpenAI
import logging
import time
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict
from ..models.daily_plan import DailyPlan
from ..models.journal import JournalEntry
from ..models.conversation import Conversation
from ..models.document import Document
from ..models.session import Session as UserSession
from ..core.config import settings
from ..config import ai_config
from .s3_service import S3Service

logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
s3_service = S3Service()

# Token budget for daily plan generation (128K total minus system prompt overhead)
MAX_DAILY_PLAN_TOKENS = 120000


def _estimate_tokens(text: str) -> int:
    """Estimate token count from text (roughly 1 token per 4 characters)"""
    if not text:
        return 0
    return len(text) // 4


def _log_daily_plan_api_call(
    response,
    start_time: float,
    success: bool,
    user_id: Optional[str] = None,
    error_message: Optional[str] = None
):
    """Log an API call from daily plan service"""
    try:
        from app.services.openai_service import log_api_call

        input_tokens = 0
        output_tokens = 0
        model = ai_config.CHAT_MODEL

        if success and response and hasattr(response, "usage") and response.usage:
            input_tokens = getattr(response.usage, "input_tokens", 0) or 0
            output_tokens = getattr(response.usage, "output_tokens", 0) or 0

        response_time_ms = int((time.time() - start_time) * 1000)

        log_api_call(
            feature="daily_plan",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            success=success,
            model=model,
            response_time_ms=response_time_ms,
            user_id=user_id,
            error_message=error_message
        )
    except Exception as e:
        logger.error(f"Failed to log daily plan API call: {e}")


class DailyPlanService:
    """Service for generating and managing daily plans"""

    @staticmethod
    async def generate_daily_plan(
        db: Session,
        session_id: str,
        user_date: str = None,
        user_id: str = None
    ) -> DailyPlan:
        """
        Generate a new daily plan for today based on all available context.

        Args:
            db: Database session
            session_id: The session ID to generate plan for
            user_date: Optional date string (YYYY-MM-DD) from user's timezone

        Returns:
            DailyPlan: The newly created daily plan
        """
        try:
            logger.info(f"Generating daily plan for session {session_id}, user_date={user_date}")

            # 1. Get today's date (use user's date if provided, otherwise server date)
            if user_date:
                try:
                    today = date.fromisoformat(user_date)
                    logger.info(f"Using user-provided date: {today}")
                except ValueError as ve:
                    logger.warning(f"Invalid user_date format: {user_date}, using server date. Error: {ve}")
                    today = date.today()
            else:
                logger.info(f"No user_date provided, using server date: {date.today()}")
                today = date.today()

            # 2. Check if plan already exists for today
            logger.info(f"Checking for existing plan for session {session_id}, date {today}")
            existing_plan = db.query(DailyPlan).filter(
                DailyPlan.session_id == session_id,
                DailyPlan.date == today
            ).first()

            if existing_plan:
                logger.info(f"Daily plan already exists for {today}, returning existing plan")
                return existing_plan

            # 3. Gather all context
            logger.info(f"Gathering context for session {session_id}")
            context = await DailyPlanService._gather_context(db, session_id)
            logger.info(f"Context gathered: {len(context.get('journal_entries', []))} journal entries, "
                       f"{len(context.get('conversations', []))} conversations, "
                       f"{len(context.get('documents', []))} documents")

            # Add today's date to context for the prompt
            context['today'] = today.strftime('%B %d, %Y')

            # 4. Check if there's sufficient data to generate a plan
            logger.info(f"Checking if sufficient data exists")
            if not DailyPlanService._has_sufficient_data(context):
                logger.info(f"Insufficient data - raising 400 error")
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail="Insufficient data to generate daily plan. Please add journal entries or have conversations first."
                )

            # 5. Generate plan using GPT-5.2
            logger.info(f"Generating plan content via OpenAI")
            plan_content = await DailyPlanService._generate_plan_content(context, user_id=user_id)
            logger.info(f"Plan content generated successfully, length: {len(plan_content)}")

            # 6. Create and save the plan
            logger.info(f"Saving daily plan to database")
            daily_plan = DailyPlan(
                session_id=session_id,
                date=today,
                content=plan_content,
                viewed=False
            )
            db.add(daily_plan)

            try:
                db.commit()
                db.refresh(daily_plan)
                logger.info(f"Daily plan created successfully for {today}, ID: {daily_plan.id}")
                return daily_plan
            except Exception as commit_error:
                db.rollback()
                # Handle race condition: if another request created a plan while we were generating
                if "unique" in str(commit_error).lower() or "duplicate" in str(commit_error).lower():
                    logger.info(f"Race condition detected - plan already exists for {today}, fetching existing")
                    existing_plan = db.query(DailyPlan).filter(
                        DailyPlan.session_id == session_id,
                        DailyPlan.date == today
                    ).first()
                    if existing_plan:
                        return existing_plan
                raise

        except Exception as e:
            db.rollback()
            # Don't log HTTPException as error - it's intentional (e.g., insufficient data)
            from fastapi import HTTPException
            if isinstance(e, HTTPException):
                raise
            # Log actual errors
            logger.error(f"Error generating daily plan. Exception type: {type(e).__name__}, "
                        f"message: '{str(e)}'", exc_info=True)
            raise Exception(f"Failed to generate daily plan: {str(e)}") from e

    @staticmethod
    async def _gather_context(db: Session, session_id: str) -> Dict:
        """
        Gather all relevant context for generating the daily plan.

        For the first plan: includes all journal entries and recent conversations
        For subsequent plans: includes only NEW data since the last plan was generated

        Returns a dict with:
        - journal_entries: List of journal entries (all for first plan, new since last plan for subsequent)
        - conversations: Conversation excerpts (all recent for first plan, new since last plan for subsequent)
        - documents: List of uploaded documents (new since last plan)
        - previous_plan: The most recent daily plan (for continuity)
        - is_first_plan: Boolean indicating if this is the first plan
        """
        context = {
            "journal_entries": [],
            "conversations": [],
            "documents": [],
            "previous_plan": None,
            "is_first_plan": False
        }

        # Get the most recent daily plan
        latest_plan = db.query(DailyPlan).filter(
            DailyPlan.session_id == session_id
        ).order_by(DailyPlan.date.desc()).first()

        if latest_plan:
            # Subsequent plan: only get NEW data since last plan was created
            cutoff_time = latest_plan.created_at

            # Get journal entries created since last plan
            journal_entries = db.query(JournalEntry).filter(
                JournalEntry.session_id == session_id,
                JournalEntry.created_at >= cutoff_time
            ).order_by(JournalEntry.entry_date.desc()).all()

            # Get conversations since last plan
            new_conversations = db.query(Conversation).filter(
                Conversation.session_id == session_id,
                Conversation.created_at >= cutoff_time
            ).order_by(Conversation.created_at.asc()).all()

            # Get documents uploaded since last plan
            new_documents = db.query(Document).filter(
                Document.session_id == session_id,
                Document.uploaded_at >= cutoff_time
            ).order_by(Document.uploaded_at.desc()).all()

            # Add the previous plan for continuity
            context["previous_plan"] = {
                "date": latest_plan.date.isoformat(),
                "content": latest_plan.user_edited_content or latest_plan.content
            }
            context["is_first_plan"] = False

        else:
            # First plan: get all available data
            # Get all journal entries
            journal_entries = db.query(JournalEntry).filter(
                JournalEntry.session_id == session_id
            ).order_by(JournalEntry.entry_date.desc()).all()

            # Get recent conversations (last 7 days) - no arbitrary limit, token truncation handles it
            seven_days_ago = datetime.utcnow() - timedelta(days=7)
            new_conversations = db.query(Conversation).filter(
                Conversation.session_id == session_id,
                Conversation.created_at >= seven_days_ago
            ).order_by(Conversation.created_at.asc()).all()

            # Get all documents - no arbitrary limit, token truncation handles it
            new_documents = db.query(Document).filter(
                Document.session_id == session_id
            ).order_by(Document.uploaded_at.desc()).all()

            context["is_first_plan"] = True

        # Format journal entries
        context["journal_entries"] = [
            {
                "date": entry.entry_date.isoformat(),
                "title": entry.title,
                "content": entry.content,
                "entry_type": entry.entry_type
            }
            for entry in journal_entries
        ]

        # Format conversations - include full content, token truncation handles limits
        context["conversations"] = [
            {
                "role": conv.role,
                "content": conv.content,
                "timestamp": conv.created_at.isoformat()
            }
            for conv in new_conversations
        ]

        # Format documents
        for doc in new_documents:
            doc_info = {
                "filename": doc.filename,
                "file_type": doc.content_type,
                "uploaded_at": doc.uploaded_at.isoformat()
            }

            # Add extracted text if available - include more for context
            if doc.extracted_text:
                doc_info["text_preview"] = doc.extracted_text[:1000]  # First 1000 chars

            context["documents"].append(doc_info)

        return context

    @staticmethod
    async def _generate_plan_content(context: Dict, user_id: str = None) -> str:
        """
        Use GPT-5.2 to generate the daily plan content.

        Args:
            context: Dictionary containing all gathered context
            user_id: Optional user ID for logging

        Returns:
            str: The generated daily plan in markdown format
        """
        start_time = time.time()
        response = None
        try:
            # Build the user prompt with all context
            user_prompt = DailyPlanService._build_user_prompt(context)

            # Call OpenAI Responses API
            response = await client.responses.create(
                model=ai_config.CHAT_MODEL,
                input=[
                    {"role": "system", "content": ai_config.DAILY_PLAN_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ]
            )

            # Log successful API call
            _log_daily_plan_api_call(response, start_time, True, user_id)

            # Extract text from Responses API
            text = getattr(response, "output_text", None)
            if text is None and getattr(response, "output", None):
                first_item = response.output[0]
                if getattr(first_item, "content", None):
                    first_content = first_item.content[0]
                    text = getattr(first_content, "text", None)

            if not text:
                raise Exception("No response from AI")

            return text.strip()

        except Exception as e:
            # Log failed API call
            _log_daily_plan_api_call(response, start_time, False, user_id, str(e)[:500])
            logger.error(f"Error calling OpenAI API: {str(e)}")
            raise

    @staticmethod
    def _build_user_prompt(context: Dict) -> str:
        """Build the user prompt from gathered context with token-based truncation"""

        # Get today's date from context if available, otherwise use server date
        today_str = context.get('today', date.today().strftime('%B %d, %Y'))
        prompt_parts = [f"Today's date: {today_str}\n"]
        total_tokens = _estimate_tokens(prompt_parts[0])

        is_first_plan = context.get("is_first_plan", False)

        if is_first_plan:
            # First plan: provide comprehensive overview
            header = "\n## FIRST DAILY PLAN\nThis is the first daily plan for this care journey. Review all available context below.\n"
            prompt_parts.append(header)
            total_tokens += _estimate_tokens(header)
        else:
            # Subsequent plan: show previous plan and what's NEW
            if context["previous_plan"]:
                prev_plan_date = context['previous_plan']['date']
                prev_content = context['previous_plan']['content']
                header = f"\n## Most Recent Daily Plan (from {prev_plan_date})\n{prev_content}"
                prompt_parts.append(header)
                total_tokens += _estimate_tokens(header)

                # Check if there's any new data
                has_new_data = (
                    len(context.get("journal_entries", [])) > 0 or
                    len(context.get("conversations", [])) > 0 or
                    len(context.get("documents", [])) > 0
                )

                if has_new_data:
                    info = f"\n## NEW INFORMATION SINCE {prev_plan_date}\nThe sections below contain ONLY data created since the {prev_plan_date} plan.\n"
                else:
                    info = f"\n## NO NEW INFORMATION SINCE {prev_plan_date}\nThere have been no new conversations, journal entries, or documents since the last plan. You can either maintain the previous plan's content or adjust based on any specific user instructions in the regeneration request.\n"
                prompt_parts.append(info)
                total_tokens += _estimate_tokens(info)

        # Add journal entries with token tracking
        if context["journal_entries"] and total_tokens < MAX_DAILY_PLAN_TOKENS:
            header = "Journal Entries" if is_first_plan else "New Journal Entries"
            section_header = f"\n## {header}\n"
            prompt_parts.append(section_header)
            total_tokens += _estimate_tokens(section_header)

            # Group by type
            by_type = {}
            for entry in context["journal_entries"]:
                entry_type = entry["entry_type"] or "note"
                if entry_type not in by_type:
                    by_type[entry_type] = []
                by_type[entry_type].append(entry)

            for entry_type, entries in by_type.items():
                if total_tokens >= MAX_DAILY_PLAN_TOKENS:
                    break
                type_header = f"\n### {entry_type.title()}s\n"
                prompt_parts.append(type_header)
                total_tokens += _estimate_tokens(type_header)

                # Add entries until token limit (no arbitrary count limit)
                for entry in entries:
                    if total_tokens >= MAX_DAILY_PLAN_TOKENS:
                        break
                    # Include full content, truncate only if single entry is huge
                    content = entry['content'] if entry['content'] else ""
                    if len(content) > 2000:
                        content = content[:2000] + "..."
                    entry_text = f"- **{entry['date']}**: {entry['title']}\n  {content}\n"
                    entry_tokens = _estimate_tokens(entry_text)

                    if total_tokens + entry_tokens <= MAX_DAILY_PLAN_TOKENS:
                        prompt_parts.append(entry_text)
                        total_tokens += entry_tokens

        # Add conversations with token tracking
        if context["conversations"] and total_tokens < MAX_DAILY_PLAN_TOKENS:
            header = "Recent Conversations" if is_first_plan else "New Conversations Since Last Plan"
            section_header = f"\n## {header}\n"
            prompt_parts.append(section_header)
            total_tokens += _estimate_tokens(section_header)

            # Add conversations from most recent, no arbitrary limit
            for conv in context["conversations"]:
                if total_tokens >= MAX_DAILY_PLAN_TOKENS:
                    break
                conv_text = f"- **{conv['role']}**: {conv['content']}\n"
                conv_tokens = _estimate_tokens(conv_text)

                if total_tokens + conv_tokens <= MAX_DAILY_PLAN_TOKENS:
                    prompt_parts.append(conv_text)
                    total_tokens += conv_tokens

        # Add documents with token tracking
        if context["documents"] and total_tokens < MAX_DAILY_PLAN_TOKENS:
            header = "Uploaded Documents" if is_first_plan else "New Documents Since Last Plan"
            section_header = f"\n## {header}\n"
            prompt_parts.append(section_header)
            total_tokens += _estimate_tokens(section_header)

            for doc in context["documents"]:
                if total_tokens >= MAX_DAILY_PLAN_TOKENS:
                    break
                doc_text = f"- {doc['filename']} ({doc['file_type']}) - uploaded {doc['uploaded_at']}\n"
                if "text_preview" in doc:
                    doc_text += f"  Preview: {doc['text_preview']}\n"
                doc_tokens = _estimate_tokens(doc_text)

                if total_tokens + doc_tokens <= MAX_DAILY_PLAN_TOKENS:
                    prompt_parts.append(doc_text)
                    total_tokens += doc_tokens

        # Add closing instruction
        if is_first_plan:
            closing = "\n\nBased on all this context, create a comprehensive daily plan for TODAY. IMPORTANT: Check the recent conversations above for any specific user instructions about what should be included in today's daily plan. If the user provided specific guidance, follow it exactly."
        else:
            prev_plan_date = context.get('previous_plan', {}).get('date', 'the previous')
            has_new_data = (
                len(context.get("journal_entries", [])) > 0 or
                len(context.get("conversations", [])) > 0 or
                len(context.get("documents", [])) > 0
            )

            if has_new_data:
                closing = f"\n\nBased on the {prev_plan_date} plan and the NEW information above, create an updated daily plan for TODAY. Maintain continuity from the previous plan while incorporating all new developments. IMPORTANT: Check the new conversations above for any specific user instructions about what should be included in today's daily plan. If the user provided specific guidance, follow it exactly."
            else:
                closing = f"\n\nSince there is no new information since the {prev_plan_date} plan, you can maintain the previous plan's content for TODAY or make minor adjustments as needed. The user may have specific instructions in their regeneration request - if so, follow them exactly."

        prompt_parts.append(closing)

        return "".join(prompt_parts)

    @staticmethod
    def _has_sufficient_data(context: Dict) -> bool:
        """
        Check if there's sufficient data to generate a meaningful daily plan.

        Args:
            context: Dictionary containing all gathered context

        Returns:
            bool: True if there's enough data, False otherwise
        """
        # For subsequent plans (has previous plan), we can always generate
        # even without new data - user might want to regenerate with new instructions
        # or the previous plan provides sufficient context
        if context.get("previous_plan"):
            return True

        # For first plan, need at least some data
        has_journal_entries = len(context.get("journal_entries", [])) > 0
        has_conversations = len(context.get("conversations", [])) > 0

        # Need at least one of these to generate a plan
        return has_journal_entries or has_conversations

    @staticmethod
    def should_generate_new_plan(db: Session, session_id: str) -> tuple[bool, Optional[DailyPlan], Optional[str]]:
        """
        Check if a new daily plan should be generated automatically.

        For the first plan: requires session to be 24+ hours old.
        For subsequent plans: requires latest plan to be from a previous day AND new data since that plan.

        Returns:
            tuple: (should_generate: bool, latest_plan: Optional[DailyPlan], reason: Optional[str])
            reason will be populated when should_generate is False to explain why
        """
        # Get the most recent plan
        latest_plan = db.query(DailyPlan).filter(
            DailyPlan.session_id == session_id
        ).order_by(DailyPlan.date.desc()).first()

        today = date.today()

        # If no plan exists, check if session is old enough (24+ hours)
        if not latest_plan:
            # Get the session to check when it was created
            session = db.query(UserSession).filter(UserSession.id == session_id).first()
            if session:
                # Calculate hours since session creation
                hours_since_creation = (datetime.utcnow() - session.created_at).total_seconds() / 3600
                # Only generate if session is 24+ hours old
                if hours_since_creation >= 24:
                    return True, None, None
                else:
                    return False, None, "Session is less than 24 hours old"
            # If session not found (shouldn't happen), don't generate
            return False, None, "Session not found"

        # If latest plan is for today, don't generate
        if latest_plan.date >= today:
            return False, latest_plan, "Plan already exists for today"

        # Latest plan is from a previous day - check for NEW data since that plan
        cutoff_time = latest_plan.created_at

        # Check for new journal entries
        new_journals = db.query(JournalEntry).filter(
            JournalEntry.session_id == session_id,
            JournalEntry.created_at >= cutoff_time
        ).count()

        # Check for new conversations
        new_conversations = db.query(Conversation).filter(
            Conversation.session_id == session_id,
            Conversation.created_at >= cutoff_time
        ).count()

        # Check for new documents
        new_documents = db.query(Document).filter(
            Document.session_id == session_id,
            Document.uploaded_at >= cutoff_time
        ).count()

        has_new_data = new_journals > 0 or new_conversations > 0 or new_documents > 0

        if has_new_data:
            return True, latest_plan, None
        else:
            return False, latest_plan, f"No new information since {latest_plan.date.isoformat()}"
