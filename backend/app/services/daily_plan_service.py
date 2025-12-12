import openai
import logging
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
client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
s3_service = S3Service()


class DailyPlanService:
    """Service for generating and managing daily plans"""

    @staticmethod
    async def generate_daily_plan(
        db: Session,
        session_id: str,
        user_date: str = None
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

            # 5. Generate plan using GPT-4o
            logger.info(f"Generating plan content via OpenAI")
            plan_content = await DailyPlanService._generate_plan_content(context)
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
            db.commit()
            db.refresh(daily_plan)

            logger.info(f"Daily plan created successfully for {today}, ID: {daily_plan.id}")
            return daily_plan

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

            # Get recent conversations (last 7 days)
            seven_days_ago = datetime.utcnow() - timedelta(days=7)
            new_conversations = db.query(Conversation).filter(
                Conversation.session_id == session_id,
                Conversation.created_at >= seven_days_ago
            ).order_by(Conversation.created_at.asc()).limit(50).all()

            # Get recent documents
            new_documents = db.query(Document).filter(
                Document.session_id == session_id
            ).order_by(Document.uploaded_at.desc()).limit(10).all()

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

        # Format conversations
        context["conversations"] = [
            {
                "role": conv.role,
                "content": conv.content[:500],  # Limit length
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

            # Add extracted text if available
            if doc.extracted_text:
                doc_info["text_preview"] = doc.extracted_text[:300]  # First 300 chars

            context["documents"].append(doc_info)

        return context

    @staticmethod
    async def _generate_plan_content(context: Dict) -> str:
        """
        Use GPT-5.2 to generate the daily plan content.

        Args:
            context: Dictionary containing all gathered context

        Returns:
            str: The generated daily plan in markdown format
        """
        try:
            # Build the user prompt with all context
            user_prompt = DailyPlanService._build_user_prompt(context)

            # Call OpenAI Responses API
            response = client.responses.create(
                model=ai_config.CHAT_MODEL,
                input=[
                    {"role": "system", "content": ai_config.DAILY_PLAN_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ]
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

            return text.strip()

        except Exception as e:
            logger.error(f"Error calling OpenAI API: {str(e)}")
            raise

    @staticmethod
    def _build_user_prompt(context: Dict) -> str:
        """Build the user prompt from gathered context"""

        # Get today's date from context if available, otherwise use server date
        today_str = context.get('today', date.today().strftime('%B %d, %Y'))
        prompt_parts = [f"Today's date: {today_str}\n"]

        is_first_plan = context.get("is_first_plan", False)

        if is_first_plan:
            # First plan: provide comprehensive overview
            prompt_parts.append("\n## FIRST DAILY PLAN")
            prompt_parts.append("This is the first daily plan for this care journey. Review all available context below.\n")
        else:
            # Subsequent plan: show previous plan and what's NEW
            if context["previous_plan"]:
                prev_plan_date = context['previous_plan']['date']
                prompt_parts.append(f"\n## Most Recent Daily Plan (from {prev_plan_date})")
                prompt_parts.append(context['previous_plan']['content'])

                # Check if there's any new data
                has_new_data = (
                    len(context.get("journal_entries", [])) > 0 or
                    len(context.get("conversations", [])) > 0 or
                    len(context.get("documents", [])) > 0
                )

                if has_new_data:
                    prompt_parts.append(f"\n## NEW INFORMATION SINCE {prev_plan_date}")
                    prompt_parts.append(f"The sections below contain ONLY data created since the {prev_plan_date} plan.\n")
                else:
                    prompt_parts.append(f"\n## NO NEW INFORMATION SINCE {prev_plan_date}")
                    prompt_parts.append("There have been no new conversations, journal entries, or documents since the last plan. You can either maintain the previous plan's content or adjust based on any specific user instructions in the regeneration request.\n")

        # Add journal entries
        if context["journal_entries"]:
            header = "Journal Entries" if is_first_plan else "New Journal Entries"
            prompt_parts.append(f"\n## {header}")
            # Group by type
            by_type = {}
            for entry in context["journal_entries"]:
                entry_type = entry["entry_type"] or "note"
                if entry_type not in by_type:
                    by_type[entry_type] = []
                by_type[entry_type].append(entry)

            for entry_type, entries in by_type.items():
                prompt_parts.append(f"\n### {entry_type.title()}s")
                for entry in entries[:5]:  # Limit to 5 per type
                    prompt_parts.append(f"- **{entry['date']}**: {entry['title']}")
                    if entry['content']:
                        prompt_parts.append(f"  {entry['content'][:200]}")  # Truncate long content

        # Add conversations
        if context["conversations"]:
            header = "Recent Conversations" if is_first_plan else "New Conversations Since Last Plan"
            prompt_parts.append(f"\n## {header}")
            # For subsequent plans, show ALL new conversations (not limited)
            # For first plans, limit to last 30
            conv_limit = 30 if is_first_plan else None
            convs_to_show = context["conversations"][-conv_limit:] if conv_limit else context["conversations"]
            for conv in convs_to_show:
                prompt_parts.append(f"- **{conv['role']}**: {conv['content']}")

        # Add documents
        if context["documents"]:
            header = "Uploaded Documents" if is_first_plan else "New Documents Since Last Plan"
            prompt_parts.append(f"\n## {header}")
            for doc in context["documents"][:10]:  # Show up to 10
                prompt_parts.append(f"- {doc['filename']} ({doc['file_type']}) - uploaded {doc['uploaded_at']}")
                if "text_preview" in doc:
                    prompt_parts.append(f"  Preview: {doc['text_preview']}")

        if is_first_plan:
            prompt_parts.append("\n\nBased on all this context, create a comprehensive daily plan for TODAY. IMPORTANT: Check the recent conversations above for any specific user instructions about what should be included in today's daily plan. If the user provided specific guidance, follow it exactly.")
        else:
            prev_plan_date = context.get('previous_plan', {}).get('date', 'the previous')
            has_new_data = (
                len(context.get("journal_entries", [])) > 0 or
                len(context.get("conversations", [])) > 0 or
                len(context.get("documents", [])) > 0
            )

            if has_new_data:
                prompt_parts.append(f"\n\nBased on the {prev_plan_date} plan and the NEW information above, create an updated daily plan for TODAY. Maintain continuity from the previous plan while incorporating all new developments. IMPORTANT: Check the new conversations above for any specific user instructions about what should be included in today's daily plan. If the user provided specific guidance, follow it exactly.")
            else:
                prompt_parts.append(f"\n\nSince there is no new information since the {prev_plan_date} plan, you can maintain the previous plan's content for TODAY or make minor adjustments as needed. The user may have specific instructions in their regeneration request - if so, follow them exactly.")

        return "\n".join(prompt_parts)

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
