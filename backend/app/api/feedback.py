from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session as DBSession
import httpx
import logging
import html
import re

from app.core.database import get_db
from app.core.config import settings
from app.core.rate_limit import limiter, RateLimits
from app.api.auth import get_current_user
from app.models.user import User
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
        logger.warning("HCAPTCHA_SECRET_KEY not configured. Skipping verification in development mode.")
        return True  # Allow in development when not configured

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
    # HTML escape
    text = html.escape(text)

    # Remove any remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Normalize whitespace
    text = ' '.join(text.split())

    return text


def get_client_ip(request: Request) -> str:
    """Get client IP address, respecting X-Forwarded-For header"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_user_agent(request: Request) -> str:
    """Get user agent from request headers"""
    return request.headers.get("User-Agent", "Unknown")


@router.post("/submit", response_model=FeedbackResponse, status_code=status.HTTP_200_OK)
@limiter.limit(RateLimits.FEEDBACK_SUBMIT)
async def submit_feedback(
    request: Request,
    feedback: FeedbackSubmit,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit user feedback

    Requires authentication and hCaptcha verification
    Rate limited to 3 submissions per hour per IP
    """
    # Get client IP for hCaptcha verification
    client_ip = get_client_ip(request)

    # Verify hCaptcha
    is_valid = await verify_hcaptcha(feedback.captcha_token, client_ip)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha verification failed. Please try again."
        )

    # Sanitize inputs to prevent XSS
    sanitized_name = sanitize_input(feedback.name)
    sanitized_message = sanitize_input(feedback.message)
    sanitized_user_agent = sanitize_input(feedback.user_agent or "")
    sanitized_page_url = sanitize_input(feedback.page_url or "")

    # Format feedback types as comma-separated string
    feedback_types_str = ", ".join([ft.value for ft in feedback.feedback_types])

    # Get additional metadata for diagnostics (privacy-conscious)
    metadata = {
        "user_id": current_user.id,
        "user_email": feedback.email,
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
            user_email=feedback.email,
            feedback_types=feedback_types_str,
            message=sanitized_message,
            metadata=metadata
        )

        if not feedback_sent:
            logger.error("Failed to send feedback email to team")
            # Don't fail the request if email fails - just log it

        # Send confirmation email to user
        confirmation_sent = email_service.send_feedback_confirmation(
            user_email=feedback.email,
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
