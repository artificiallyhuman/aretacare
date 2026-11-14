from pydantic import BaseModel, Field
from datetime import datetime

from app.core.email_address import NormalizedEmail


class InvitationSend(BaseModel):
    """Request to send an invitation to a user who doesn't have an account"""
    email: NormalizedEmail
    confirm_sharing_consent: bool = Field(..., description="User confirms they have the right to share this session")


class PendingInvitationResponse(BaseModel):
    """Response with pending invitation details"""
    id: str
    email: str
    session_id: str
    invited_by_name: str
    created_at: datetime
    days_remaining: int  # Days until expiration (30 days from created_at)
    is_expired: bool

    class Config:
        from_attributes = True


class InvitationCheckResponse(BaseModel):
    """Response indicating if email has pending invitations"""
    has_invitations: bool
    invitation_count: int
    sessions: list[dict]  # List of {session_id, session_name, invited_by_name}
