"""
Waitlist API endpoints for controlled signup flow.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session as DBSession
import html

from app.core.database import get_db
from app.core.config import settings
from app.core.rate_limit import limiter, RateLimits
from app.models.waitlist import WaitlistEntry
from app.models.user import User
from app.schemas.waitlist import (
    WaitlistJoinRequest,
    WaitlistJoinResponse,
    SignupModeResponse,
)
from app.api.feedback import verify_hcaptcha, get_client_ip

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


@router.get("/signup-mode", response_model=SignupModeResponse)
async def get_signup_mode():
    """
    Public endpoint to check if signups are controlled (no auth required).
    Returns whether registration requires an invitation.
    """
    return SignupModeResponse(control_signups=settings.CONTROL_SIGNUPS)


@router.post("/join", response_model=WaitlistJoinResponse)
@limiter.limit(RateLimits.WAITLIST_JOIN)
async def join_waitlist(
    request: Request,
    data: WaitlistJoinRequest,
    db: DBSession = Depends(get_db)
):
    """
    Add email to waitlist (public endpoint, no auth required).
    Only meaningful when CONTROL_SIGNUPS=TRUE.
    Requires hCaptcha verification.
    """
    # Verify hCaptcha
    client_ip = get_client_ip(request)
    is_valid = await verify_hcaptcha(data.captcha_token, client_ip)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha verification failed. Please try again."
        )

    email = data.email.lower().strip()

    # Sanitize user message if provided
    user_message = None
    if data.message:
        # HTML escape and normalize whitespace, truncate to 1000 chars
        user_message = html.escape(data.message.strip())[:1000]

    # Check if already a registered user
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is already registered. Please log in."
        )

    # Check if already on waitlist
    existing_entry = db.query(WaitlistEntry).filter(
        WaitlistEntry.email == email
    ).first()

    if existing_entry:
        if existing_entry.invitation_token:
            return WaitlistJoinResponse(
                success=True,
                message="You've already been invited. Please check your email for the registration link.",
                already_on_list=True
            )
        return WaitlistJoinResponse(
            success=True,
            message="You're already on the waitlist. We'll send you an invitation when a spot opens up.",
            already_on_list=True
        )

    # Add to waitlist
    entry = WaitlistEntry(email=email, user_message=user_message)
    db.add(entry)
    db.commit()

    return WaitlistJoinResponse(
        success=True,
        message="You've been added to the waitlist. We'll send you an invitation when a spot opens up."
    )
