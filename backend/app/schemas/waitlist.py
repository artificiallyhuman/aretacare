from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


class WaitlistJoinRequest(BaseModel):
    """Schema for joining the waitlist."""
    email: EmailStr


class WaitlistJoinResponse(BaseModel):
    """Schema for waitlist join response."""
    success: bool
    message: str
    already_on_list: bool = False


class SignupModeResponse(BaseModel):
    """Schema for signup mode response."""
    control_signups: bool


class ReferrerInfo(BaseModel):
    """Schema for referrer information."""
    user_id: str
    user_email: str
    session_name: str


class WaitlistEntryResponse(BaseModel):
    """Schema for waitlist entry response."""
    id: str
    email: str
    created_at: datetime
    invited_at: Optional[datetime] = None
    has_invitation: bool
    notes: Optional[str] = None
    added_by_email: Optional[str] = None
    referrers: Optional[List[ReferrerInfo]] = None

    class Config:
        from_attributes = True


class WaitlistAddRequest(BaseModel):
    """Schema for manually adding to waitlist (admin)."""
    email: EmailStr


class WaitlistUpdateRequest(BaseModel):
    """Schema for updating a waitlist entry."""
    notes: Optional[str] = None
