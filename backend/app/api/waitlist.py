"""
Waitlist API endpoints for controlled signup flow.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session as DBSession
import html
import logging

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
from app.api.feedback import verify_hcaptcha
from app.core.client_ip import get_client_ip
from app.services.security_service import security_service

logger = logging.getLogger(__name__)

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
    Requires hCaptcha verification whenever the client can produce a token.
    """
    client_ip = get_client_ip(request)

    # Any request that supplies a captcha token must pass verification — a bad token is
    # never treated as "no token" and waved through on the native path below.
    if data.captcha_token:
        is_valid = await verify_hcaptcha(data.captcha_token, client_ip)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Captcha verification failed. Please try again."
            )
    else:
        # The native iOS app has no captcha implementation, so it submits without a token.
        #
        # NOTE: this is a known, deliberately-narrowed weakness, not a solved problem. The
        # gate is `X-Client-Type: ios`, a header the caller chooses rather than proves, so
        # `curl -H 'X-Client-Type: ios'` reaches this branch too. Properly closing it needs
        # Apple App Attest / DeviceCheck on the native client and verification here; until
        # then every use of this path is logged so abuse is at least visible, and the
        # route's existing 5/hour per-IP limit still applies.
        if request.headers.get("X-Client-Type") != "ios":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Captcha verification is required."
            )

        try:
            security_service.log_event(
                db=db,
                event_type="waitlist_join_without_captcha",
                email=data.email.lower().strip(),
                ip_address=client_ip,
                user_agent=request.headers.get("User-Agent"),
                endpoint="/api/waitlist/join",
                details="Waitlist submission accepted without captcha (native client path)",
            )
        except Exception as e:  # pragma: no cover - logging must not block signup
            logger.warning(f"Failed to log captcha-less waitlist join: {e}")

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
