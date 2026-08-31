"""
Email preference endpoints for admin product-update emails.

Two flavors share this module because they flip the same bit
(users.email_unsubscribed_at):

- The unsubscribe endpoints are deliberately UNAUTHENTICATED: the recipient
  clicks a link in an email and may not be logged in. The per-user token
  (secrets.token_urlsafe(32), stored on users.unsubscribe_token) is the sole
  credential — 256 bits, not brute-forceable; the rate limit is hygiene only.
  Both are idempotent so re-clicking a link, or a mail scanner replaying it,
  still lands on a success response.
- The /preferences pair is authenticated and backs the Settings toggle
  ("Receive product update emails"), which can also opt back IN.

Either path affects ONLY admin campaign emails; transactional email (password
resets, security alerts, invitations) is unaffected.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession
import logging

from app.core.database import get_db
from app.core.rate_limit import limiter, RateLimits
from app.api.auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email-preferences"])


class UnsubscribeRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=128)


class UnsubscribeResponse(BaseModel):
    message: str
    already_unsubscribed: bool
    email: str  # masked — the token can leak via forwarded emails


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    visible = local[0] if local else ""
    return f"{visible}***@{domain}"


def _unsubscribe_by_token(db: DBSession, token: str) -> tuple:
    user = db.query(User).filter(User.unsubscribe_token == token).first()
    if user is None:
        # Also covers deleted users — the token row is gone with them.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid unsubscribe link"
        )
    already = user.email_unsubscribed_at is not None
    if not already:
        user.email_unsubscribed_at = datetime.utcnow()
        db.commit()
        logger.info(f"User {user.id} unsubscribed from product-update emails")
    return user, already


@router.post("/unsubscribe", response_model=UnsubscribeResponse)
@limiter.limit(RateLimits.UNSUBSCRIBE)
async def unsubscribe(
    request: Request,
    data: UnsubscribeRequest,
    db: DBSession = Depends(get_db)
):
    """Page-driven unsubscribe: the /unsubscribe frontend page POSTs the token
    from the emailed link on mount."""
    user, already = _unsubscribe_by_token(db, data.token)
    return UnsubscribeResponse(
        message="You've been unsubscribed from AretaCare product-update emails.",
        already_unsubscribed=already,
        email=_mask_email(user.email),
    )


@router.post("/unsubscribe/one-click")
@limiter.limit(RateLimits.UNSUBSCRIBE)
async def unsubscribe_one_click(
    request: Request,
    token: str = Query(..., min_length=20, max_length=128),
    db: DBSession = Depends(get_db)
):
    """RFC 8058 one-click target for the List-Unsubscribe-Post header.

    Mail providers POST here directly (form-encoded body
    `List-Unsubscribe=One-Click`) when the user hits their native unsubscribe
    control. No body model is declared so any body — or none — is accepted.
    """
    _unsubscribe_by_token(db, token)
    return {"message": "Unsubscribed"}


# ---------------------------------------------------------------------------
# Authenticated preference toggle (Settings page)
# ---------------------------------------------------------------------------

class EmailPreferencesResponse(BaseModel):
    product_updates: bool  # True = subscribed (the default state)


class EmailPreferencesUpdateRequest(BaseModel):
    product_updates: bool


@router.get("/preferences", response_model=EmailPreferencesResponse)
async def get_email_preferences(
    current_user: User = Depends(get_current_user)
):
    """Current user's product-update email preference."""
    return EmailPreferencesResponse(
        product_updates=current_user.email_unsubscribed_at is None
    )


@router.put("/preferences", response_model=EmailPreferencesResponse)
async def update_email_preferences(
    data: EmailPreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Opt in or out of product-update emails from Settings.

    Opting out is identical to clicking an emailed unsubscribe link (the admin
    panel shows the user as unsubscribed either way); opting back in clears it.
    """
    if data.product_updates:
        if current_user.email_unsubscribed_at is not None:
            current_user.email_unsubscribed_at = None
            db.commit()
            logger.info(f"User {current_user.id} re-subscribed to product-update emails via Settings")
    else:
        if current_user.email_unsubscribed_at is None:
            current_user.email_unsubscribed_at = datetime.utcnow()
            db.commit()
            logger.info(f"User {current_user.id} unsubscribed from product-update emails via Settings")

    return EmailPreferencesResponse(
        product_updates=current_user.email_unsubscribed_at is None
    )
