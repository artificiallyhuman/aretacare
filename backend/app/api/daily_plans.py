from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, date, timedelta

from ..core.database import get_db
from ..api.auth import get_current_user
from ..models.user import User
from ..models.daily_plan import DailyPlan
from ..models.session import Session as UserSession
from ..schemas.daily_plan import (
    DailyPlanResponse,
    DailyPlanUpdate,
    DailyPlanMarkViewed,
    DailyPlanCheckResponse
)
from ..services.daily_plan_service import DailyPlanService

router = APIRouter()


@router.get("/{session_id}", response_model=List[DailyPlanResponse])
async def get_all_daily_plans(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all daily plans for a session, ordered by date (most recent first)"""

    # Verify session belongs to user
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get all daily plans
    plans = db.query(DailyPlan).filter(
        DailyPlan.session_id == session_id
    ).order_by(DailyPlan.date.desc()).all()

    return plans


@router.get("/{session_id}/latest", response_model=DailyPlanResponse)
async def get_latest_daily_plan(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the latest daily plan for a session"""

    # Verify session belongs to user
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get latest plan
    plan = db.query(DailyPlan).filter(
        DailyPlan.session_id == session_id
    ).order_by(DailyPlan.date.desc()).first()

    if not plan:
        raise HTTPException(status_code=404, detail="No daily plans found")

    return plan


@router.get("/{session_id}/check", response_model=DailyPlanCheckResponse)
async def check_daily_plan_status(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if a new daily plan should be generated (24 hours have passed)"""

    # Verify session belongs to user
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if should generate
    should_generate, latest_plan = DailyPlanService.should_generate_new_plan(db, session_id)

    response = {
        "should_generate": should_generate,
        "latest_plan_date": latest_plan.date if latest_plan else None,
        "hours_since_last_plan": None
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate a new daily plan for today"""

    # Verify session belongs to user
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Generate the plan
    try:
        plan = await DailyPlanService.generate_daily_plan(db, session_id)
        return plan
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate daily plan: {str(e)}")


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

    # Verify plan belongs to user's session
    session = db.query(UserSession).filter(
        UserSession.id == plan.session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=403, detail="Not authorized to update this plan")

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
    """Mark a daily plan as viewed"""

    # Get the plan
    plan = db.query(DailyPlan).filter(DailyPlan.id == plan_id).first()

    if not plan:
        raise HTTPException(status_code=404, detail="Daily plan not found")

    # Verify plan belongs to user's session
    session = db.query(UserSession).filter(
        UserSession.id == plan.session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=403, detail="Not authorized to update this plan")

    # Mark as viewed
    plan.viewed = mark_viewed.viewed
    plan.updated_at = datetime.utcnow()

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

    # Verify plan belongs to user's session
    session = db.query(UserSession).filter(
        UserSession.id == plan.session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=403, detail="Not authorized to delete this plan")

    # Delete the plan
    db.delete(plan)
    db.commit()

    return {"message": "Daily plan deleted successfully"}
