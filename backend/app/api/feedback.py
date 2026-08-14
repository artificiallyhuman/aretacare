from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session as DBSession
import httpx
import logging
import html

from app.core.database import get_db
from app.core.client_ip import get_client_ip
from app.core.config import settings
from app.core.rate_limit import limiter, RateLimits
from app.api.auth import get_optional_user
from app.models.user import User
from typing import Optional
from app.schemas.feedback import FeedbackSubmit, FeedbackResponse, FeedbackType
from app.services.email_service import email_service

logger = logging.getLogger(__name__)

router = APIRouter()


async def verify_hcaptcha(token: str, remote_ip: str) -> bool:
    """
    Verify hCaptcha token with hCaptcha API

    Args:
        token: The hCaptcha response token from frontend
        remote_ip: The user's IP address

    Returns:
        bool: True if verification successful, False otherwise
    """
    if not settings.HCAPTCHA_SECRET_KEY:
        if settings.DEBUG:
            logger.warning(
                "HCAPTCHA_SECRET_KEY not configured — captcha verification bypassed (DEBUG only)."
            )
            return True
        # Fail closed outside development. Returning True here previously meant a missing
        # key silently disabled captcha on the waitlist and feedback endpoints in
        # production, with nothing but a log line to reveal it.
        logger.critical(
            "HCAPTCHA_SECRET_KEY not configured in a non-DEBUG environment — "
            "rejecting captcha verification. Set HCAPTCHA_SECRET_KEY."
        )
        return False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://hcaptcha.com/siteverify",
                data={
                    "secret": settings.HCAPTCHA_SECRET_KEY,
                    "response": token,
                    "remoteip": remote_ip
                },
                timeout=10.0
            )

            if response.status_code != 200:
                logger.error(f"hCaptcha verification failed with status {response.status_code}")
                return False

            result = response.json()
            return result.get("success", False)

    except httpx.TimeoutException:
        logger.error("hCaptcha verification timeout")
        return False
    except Exception as e:
        logger.error(f"hCaptcha verification error: {str(e)}")
        return False


def sanitize_input(text: str) -> str:
    """
    Sanitize user input to prevent XSS and other injection attacks

    Args:
        text: Raw user input

    Returns:
        str: Sanitized text
    """
    # HTML escape (converts < to &lt; and > to &gt;)
    text = html.escape(text)

    # Normalize whitespace
    text = ' '.join(text.split())

    return text


def get_user_agent(request: Request) -> str:
    """Get user agent from request headers"""
    return request.headers.get("User-Agent", "Unknown")


@router.post("/submit", response_model=FeedbackResponse, status_code=status.HTTP_200_OK)
@limiter.limit(RateLimits.FEEDBACK_SUBMIT)
async def submit_feedback(
    request: Request,
    feedback: FeedbackSubmit,
    db: DBSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Submit user feedback

    Works with or without authentication. hCaptcha required.
    Rate limited to 3 submissions per hour per IP
    """
    # Get client IP for hCaptcha verification
    client_ip = get_client_ip(request)

    # Verify hCaptcha (skip for authenticated users — they've already proven they're human)
    if not current_user:
        if not feedback.captcha_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Captcha verification is required."
            )
        is_valid = await verify_hcaptcha(feedback.captcha_token, client_ip)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Captcha verification failed. Please try again."
            )

    # The confirmation email goes to this address, so for a signed-in user it must be
    # their own verified address rather than whatever the request body claims. Otherwise
    # any authenticated account can have mail sent from the AretaCare domain to arbitrary
    # third parties, with the (escaped) message body under the sender's control.
    reply_to_email = current_user.email if current_user else feedback.email

    # Sanitize inputs to prevent XSS
    sanitized_name = sanitize_input(feedback.name)
    sanitized_message = sanitize_input(feedback.message)
    sanitized_user_agent = sanitize_input(feedback.user_agent or "")
    sanitized_page_url = sanitize_input(feedback.page_url or "")

    # Format feedback types as comma-separated string
    feedback_types_str = ", ".join([ft.value for ft in feedback.feedback_types])

    # Get additional metadata for diagnostics (privacy-conscious)
    metadata = {
        "user_id": current_user.id if current_user else None,
        "user_email": reply_to_email,
        "user_name": sanitized_name,
        "feedback_types": feedback_types_str,
        "user_agent": sanitized_user_agent[:500],  # Truncate to prevent abuse
        "page_url": sanitized_page_url[:1000],  # Truncate to prevent abuse
        "client_ip": client_ip
    }

    try:
        # Send feedback email to AretaCare team
        feedback_sent = email_service.send_feedback_to_team(
            user_name=sanitized_name,
            user_email=reply_to_email,
            feedback_types=feedback_types_str,
            message=sanitized_message,
            metadata=metadata
        )

        if not feedback_sent:
            logger.error("Failed to send feedback email to team")
            # Don't fail the request if email fails - just log it

        # Send confirmation email to user
        confirmation_sent = email_service.send_feedback_confirmation(
            user_email=reply_to_email,
            user_name=sanitized_name,
            feedback_types=feedback_types_str,
            message=sanitized_message
        )

        if not confirmation_sent:
            logger.error("Failed to send feedback confirmation email to user")
            # Don't fail the request if email fails - just log it

        logger.info(f"Feedback submitted successfully by {feedback.email} (types: {feedback_types_str})")

        return FeedbackResponse(
            success=True,
            message="Thank you for your feedback. We've received your submission and will review it shortly."
        )

    except Exception as e:
        logger.error(f"Error processing feedback: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit feedback. Please try again later."
        )
