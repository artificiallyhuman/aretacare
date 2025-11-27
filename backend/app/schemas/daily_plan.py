from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional


class DailyPlanBase(BaseModel):
    content: str
    user_edited_content: Optional[str] = None


class DailyPlanCreate(BaseModel):
    """Schema for creating a new daily plan"""
    user_date: Optional[str] = None  # Optional YYYY-MM-DD date from user's timezone


class DailyPlanUpdate(BaseModel):
    """Schema for updating a daily plan (user edits)"""
    user_edited_content: str


class DailyPlanMarkViewed(BaseModel):
    """Schema for marking a plan as viewed"""
    viewed: bool = True


class DailyPlanResponse(DailyPlanBase):
    """Schema for daily plan response"""
    id: int
    session_id: str
    date: date
    viewed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DailyPlanCheckResponse(BaseModel):
    """Schema for checking if new plan should be generated"""
    should_generate: bool
    latest_plan_date: Optional[date] = None
    hours_since_last_plan: Optional[float] = None
