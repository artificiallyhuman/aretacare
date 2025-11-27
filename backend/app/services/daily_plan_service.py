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
from .s3_service import S3Service

logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
s3_service = S3Service()


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
            logger.info(f"Generating daily plan for session {session_id}")

            # 1. Get today's date (use user's date if provided, otherwise server date)
            if user_date:
                try:
                    today = date.fromisoformat(user_date)
                    logger.info(f"Using user-provided date: {today}")
                except ValueError:
                    logger.warning(f"Invalid user_date format: {user_date}, using server date")
                    today = date.today()
            else:
                today = date.today()

            # 2. Check if plan already exists for today
            existing_plan = db.query(DailyPlan).filter(
                DailyPlan.session_id == session_id,
                DailyPlan.date == today
            ).first()

            if existing_plan:
                logger.info(f"Daily plan already exists for {today}")
                return existing_plan

            # 3. Gather all context
            context = await DailyPlanService._gather_context(db, session_id)

            # Add today's date to context for the prompt
            context['today'] = today.strftime('%B %d, %Y')

            # 4. Check if there's sufficient data to generate a plan
            if not DailyPlanService._has_sufficient_data(context):
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail="Insufficient data to generate daily plan. Please add journal entries or have conversations first."
                )

            # 5. Generate plan using GPT-5.1
            plan_content = await DailyPlanService._generate_plan_content(context)

            # 6. Create and save the plan
            daily_plan = DailyPlan(
                session_id=session_id,
                date=today,
                content=plan_content,
                viewed=False
            )
            db.add(daily_plan)
            db.commit()
            db.refresh(daily_plan)

            logger.info(f"Daily plan created successfully for {today}")
            return daily_plan

        except Exception as e:
            logger.error(f"Error generating daily plan: {str(e)}", exc_info=True)
            db.rollback()
            # Don't catch HTTPException - let FastAPI handle it
            from fastapi import HTTPException
            if isinstance(e, HTTPException):
                raise
            raise Exception(f"Failed to generate daily plan: {str(e)}") from e

    @staticmethod
    async def _gather_context(db: Session, session_id: str) -> Dict:
        """
        Gather all relevant context for generating the daily plan.

        Returns a dict with:
        - journal_entries: List of recent journal entries
        - conversations: Recent conversation excerpts
        - documents: List of uploaded documents (with presigned URLs)
        - previous_plans: Previous 3 daily plans for continuity
        """
        context = {
            "journal_entries": [],
            "conversations": [],
            "documents": [],
            "previous_plans": []
        }

        # Get journal entries (all entries, grouped by category)
        journal_entries = db.query(JournalEntry).filter(
            JournalEntry.session_id == session_id
        ).order_by(JournalEntry.entry_date.desc()).all()

        context["journal_entries"] = [
            {
                "date": entry.entry_date.isoformat(),
                "title": entry.title,
                "content": entry.content,
                "entry_type": entry.entry_type
            }
            for entry in journal_entries
        ]

        # Get recent conversations (last 7 days)
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_conversations = db.query(Conversation).filter(
            Conversation.session_id == session_id,
            Conversation.created_at >= seven_days_ago
        ).order_by(Conversation.created_at.asc()).limit(50).all()

        context["conversations"] = [
            {
                "role": conv.role,
                "content": conv.content[:500],  # Limit length
                "timestamp": conv.created_at.isoformat()
            }
            for conv in recent_conversations
        ]

        # Get documents (recent uploads)
        recent_documents = db.query(Document).filter(
            Document.session_id == session_id
        ).order_by(Document.uploaded_at.desc()).limit(10).all()

        for doc in recent_documents:
            doc_info = {
                "filename": doc.filename,
                "file_type": doc.content_type,
                "uploaded_at": doc.uploaded_at.isoformat()
            }

            # Add extracted text if available
            if doc.extracted_text:
                doc_info["text_preview"] = doc.extracted_text[:300]  # First 300 chars

            context["documents"].append(doc_info)

        # Get previous 3 daily plans for continuity
        previous_plans = db.query(DailyPlan).filter(
            DailyPlan.session_id == session_id
        ).order_by(DailyPlan.date.desc()).limit(3).all()

        context["previous_plans"] = [
            {
                "date": plan.date.isoformat(),
                "content": plan.user_edited_content or plan.content
            }
            for plan in previous_plans
        ]

        return context

    @staticmethod
    async def _generate_plan_content(context: Dict) -> str:
        """
        Use GPT-5.1 to generate the daily plan content.

        Args:
            context: Dictionary containing all gathered context

        Returns:
            str: The generated daily plan in markdown format
        """
        try:
            # Build the user prompt with all context
            user_prompt = DailyPlanService._build_user_prompt(context)

            # Call OpenAI API
            response = client.chat.completions.create(
                model="gpt-4o",  # GPT-5.1
                messages=[
                    {"role": "system", "content": DAILY_PLAN_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=800  # Keep response concise
            )

            plan_content = response.choices[0].message.content.strip()
            return plan_content

        except Exception as e:
            logger.error(f"Error calling OpenAI API: {str(e)}")
            raise

    @staticmethod
    def _build_user_prompt(context: Dict) -> str:
        """Build the user prompt from gathered context"""

        # Get today's date from context if available, otherwise use server date
        today_str = context.get('today', date.today().strftime('%B %d, %Y'))
        prompt_parts = [f"Today's date: {today_str}\n"]

        # Add previous plans if available
        if context["previous_plans"]:
            prompt_parts.append("\n## Previous Daily Plans (for continuity)")
            for plan in context["previous_plans"]:
                prompt_parts.append(f"\n### {plan['date']}")
                prompt_parts.append(plan['content'])

        # Add journal entries
        if context["journal_entries"]:
            prompt_parts.append("\n## Journal Entries")
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

        # Add recent conversations
        if context["conversations"]:
            prompt_parts.append("\n## Recent Conversations (last 7 days)")
            for conv in context["conversations"][-10:]:  # Last 10 messages
                prompt_parts.append(f"- **{conv['role']}**: {conv['content']}")

        # Add documents
        if context["documents"]:
            prompt_parts.append("\n## Uploaded Documents")
            for doc in context["documents"][:5]:  # Limit to 5
                prompt_parts.append(f"- {doc['filename']} ({doc['file_type']}) - uploaded {doc['uploaded_at']}")
                if "text_preview" in doc:
                    prompt_parts.append(f"  Preview: {doc['text_preview']}")

        prompt_parts.append("\n\nBased on all this context, create a concise daily plan for TODAY.")

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
        # Check if there are any journal entries
        has_journal_entries = len(context.get("journal_entries", [])) > 0

        # Check if there are any conversations
        has_conversations = len(context.get("conversations", [])) > 0

        # Need at least one of these to generate a plan
        return has_journal_entries or has_conversations

    @staticmethod
    def should_generate_new_plan(db: Session, session_id: str) -> tuple[bool, Optional[DailyPlan]]:
        """
        Check if a new daily plan should be generated (24 hours have passed).

        Returns:
            tuple: (should_generate: bool, latest_plan: Optional[DailyPlan])
        """
        # Get the most recent plan
        latest_plan = db.query(DailyPlan).filter(
            DailyPlan.session_id == session_id
        ).order_by(DailyPlan.date.desc()).first()

        today = date.today()

        # If no plan exists, should generate
        if not latest_plan:
            return True, None

        # If latest plan is not for today, should generate
        if latest_plan.date < today:
            return True, latest_plan

        # Plan already exists for today
        return False, latest_plan
