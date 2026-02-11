from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from ..core.database import get_db
from ..api.auth import get_current_user
from ..api.permissions import check_session_access
from ..models.user import User
from ..models.daily_plan import DailyPlan
from ..models.daily_plan_view import DailyPlanView
from ..models.session import Session as UserSession
from ..schemas.daily_plan import (
    DailyPlanResponse,
    DailyPlanUpdate,
    DailyPlanMarkViewed,
    DailyPlanCheckResponse,
    DailyPlanListResponse
)
from ..services.daily_plan_service import DailyPlanService

router = APIRouter()


@router.get("/{session_id}", response_model=DailyPlanListResponse)
async def get_all_daily_plans(
    session_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get daily plans for a session with pagination, ordered by date (most recent first)"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check_session_access(session, current_user.id, db)

    # Build base query
    query = db.query(DailyPlan).filter(DailyPlan.session_id == session_id)

    # Get total count before pagination
    total = query.count()

    # Get daily plans with pagination
    plans = query.order_by(DailyPlan.date.desc()).offset(offset).limit(limit).all()

    # Get all view records for this user in one query
    plan_ids = [plan.id for plan in plans]
    user_views = db.query(DailyPlanView.daily_plan_id).filter(
        DailyPlanView.daily_plan_id.in_(plan_ids),
        DailyPlanView.user_id == current_user.id
    ).all()
    viewed_plan_ids = {view.daily_plan_id for view in user_views}

    # Set viewed status for each plan based on current user
    for plan in plans:
        plan.viewed = plan.id in viewed_plan_ids

    return DailyPlanListResponse(
        plans=plans,
        has_more=(offset + len(plans)) < total,
        total=total
    )


@router.get("/{session_id}/latest", response_model=Optional[DailyPlanResponse])
async def get_latest_daily_plan(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the latest daily plan for a session (returns null if none exist)"""
    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check_session_access(session, current_user.id, db)

    # Get latest plan (returns None if no plans exist - that's okay for new sessions)
    plan = db.query(DailyPlan).filter(
        DailyPlan.session_id == session_id
    ).order_by(DailyPlan.date.desc()).first()

    if plan:
        # Check if current user has viewed this plan
        user_view = db.query(DailyPlanView).filter(
            DailyPlanView.daily_plan_id == plan.id,
            DailyPlanView.user_id == current_user.id
        ).first()
        # Set viewed status for this user
        plan.viewed = user_view is not None

    return plan


@router.get("/{session_id}/check", response_model=DailyPlanCheckResponse)
async def check_daily_plan_status(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if a new daily plan should be generated automatically (requires new data since last plan)"""

    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check_session_access(session, current_user.id, db)

    # Check if should generate
    should_generate, latest_plan, reason = DailyPlanService.should_generate_new_plan(db, session_id)

    response = {
        "should_generate": should_generate,
        "latest_plan_date": latest_plan.date if latest_plan else None,
        "hours_since_last_plan": None,
        "reason": reason  # Will be populated when should_generate is False
    }

    if latest_plan:
        # Calculate hours since last plan
        today = date.today()
        days_diff = (today - latest_plan.date).days
        response["hours_since_last_plan"] = days_diff * 24

    return response


@router.post("/{session_id}/generate", response_model=DailyPlanResponse)
async def generate_daily_plan(
    session_id: str,
    user_date: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate a new daily plan for today

    Args:
        user_date: Optional date in YYYY-MM-DD format from user's timezone
    """

    # Verify user has access to session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check_session_access(session, current_user.id, db)

    # Generate the plan (HTTPException will pass through to FastAPI)
    plan = await DailyPlanService.generate_daily_plan(db, session_id, user_date, user_id=current_user.id)

    # Check if current user has viewed this plan (for existing plans returned by generate)
    user_view = db.query(DailyPlanView).filter(
        DailyPlanView.daily_plan_id == plan.id,
        DailyPlanView.user_id == current_user.id
    ).first()
    plan.viewed = user_view is not None

    # Push notification to session participants (non-blocking)
    try:
        from app.models import SessionCollaborator
        collaborator_ids = [c.user_id for c in db.query(SessionCollaborator.user_id).filter(
            SessionCollaborator.session_id == session_id
        ).all()]
        all_participant_ids = collaborator_ids + [session.owner_id]
        from app.services.push_notification_service import PushNotificationService
        PushNotificationService.notify_daily_digest(
            session_id=session_id,
            session_name=session.name,
            user_ids=all_participant_ids,
            exclude_user_id=current_user.id,
        )
    except Exception as push_err:
        import logging
        logging.getLogger(__name__).warning(f"Push notification failed (non-fatal): {push_err}")

    return plan


@router.put("/{plan_id}", response_model=DailyPlanResponse)
async def update_daily_plan(
    plan_id: int,
    plan_update: DailyPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a daily plan (user edits)"""

    # Get the plan
    plan = db.query(DailyPlan).filter(DailyPlan.id == plan_id).first()

    if not plan:
        raise HTTPException(status_code=404, detail="Daily plan not found")

    # Verify user has access to plan's session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == plan.session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check_session_access(session, current_user.id, db)

    # Update the plan
    plan.user_edited_content = plan_update.user_edited_content
    plan.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(plan)

    return plan


@router.put("/{plan_id}/mark-viewed", response_model=DailyPlanResponse)
async def mark_plan_viewed(
    plan_id: int,
    mark_viewed: DailyPlanMarkViewed,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a daily plan as viewed (per-user tracking)"""
    # Get the plan
    plan = db.query(DailyPlan).filter(DailyPlan.id == plan_id).first()

    if not plan:
        raise HTTPException(status_code=404, detail="Daily plan not found")

    # Verify user has access to plan's session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == plan.session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check_session_access(session, current_user.id, db)

    # Create or update per-user view record
    if mark_viewed.viewed:
        # Check if user has already viewed this plan
        existing_view = db.query(DailyPlanView).filter(
            DailyPlanView.daily_plan_id == plan_id,
            DailyPlanView.user_id == current_user.id
        ).first()

        if not existing_view:
            # Create new view record
            view_record = DailyPlanView(
                daily_plan_id=plan_id,
                user_id=current_user.id
            )
            db.add(view_record)
    else:
        # Remove view record (user is marking as unviewed)
        db.query(DailyPlanView).filter(
            DailyPlanView.daily_plan_id == plan_id,
            DailyPlanView.user_id == current_user.id
        ).delete()

    db.commit()
    db.refresh(plan)

    return plan


@router.delete("/{plan_id}")
async def delete_daily_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a daily plan"""

    # Get the plan
    plan = db.query(DailyPlan).filter(DailyPlan.id == plan_id).first()

    if not plan:
        raise HTTPException(status_code=404, detail="Daily plan not found")

    # Verify user has access to plan's session (owner or collaborator)
    session = db.query(UserSession).filter(UserSession.id == plan.session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check_session_access(session, current_user.id, db)

    # Delete the plan
    db.delete(plan)
    db.commit()

    return {"message": "Daily plan deleted successfully"}
