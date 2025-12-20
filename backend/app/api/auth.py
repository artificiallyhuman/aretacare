from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session as DBSession
from typing import Optional
from datetime import datetime, timedelta
import secrets
import logging
import re

from app.core.database import get_db
from app.core.auth import (
    verify_password, get_password_hash, create_access_token, decode_access_token,
    create_refresh_token_record, verify_refresh_token, revoke_refresh_token, revoke_all_user_tokens
)
from app.core.config import settings
from app.core.rate_limit import limiter, RateLimits
from app.models.user import User
from app.models.session import Session
from app.models.document import Document
from app.models.audio_recording import AudioRecording
from app.schemas.auth import (
    UserRegister, UserLogin, TokenResponse, UserResponse,
    UpdateName, UpdateEmail, UpdatePassword, DeleteAccount,
    PasswordResetRequest, PasswordReset, RefreshTokenRequest
)
from app.services.email_service import email_service
from app.services.s3_service import s3_service
from app.services.security_service import security_service

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()

# Cookie configuration for refresh tokens
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60  # 30 days in seconds


# Valid JWT pattern: base64url characters and dots only
JWT_PATTERN = re.compile(r'^[A-Za-z0-9_\-\.]+$')


def set_refresh_token_cookie(response: Response, refresh_token: str):
    """Set HttpOnly cookie for refresh token."""
    # Validate token contains only safe JWT characters to prevent cookie injection
    if not refresh_token or not JWT_PATTERN.match(refresh_token):
        raise ValueError("Invalid refresh token format")

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=REFRESH_TOKEN_MAX_AGE,
        httponly=True,  # Prevents JavaScript access - protects against XSS
        secure=not settings.DEBUG,  # HTTPS only in production
        samesite="lax",  # Protects against CSRF while allowing normal navigation
        path="/api/auth"  # Only send cookie to auth endpoints
    )


def clear_refresh_token_cookie(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        path="/api/auth"
    )


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: DBSession = Depends(get_db)
) -> User:
    """Get the current authenticated user from JWT token."""
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        # Log invalid token attempt
        security_service.log_invalid_token(
            db=db,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request),
            endpoint=request.url.path,
            details="Invalid JWT token"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if user_id is None:
        # Log invalid token attempt
        security_service.log_invalid_token(
            db=db,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request),
            endpoint=request.url.path,
            details="Token missing user ID"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        # Log invalid token attempt (user doesn't exist)
        security_service.log_invalid_token(
            db=db,
            user_id=user_id,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request),
            endpoint=request.url.path,
            details="User not found"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(RateLimits.REGISTER)
def register(request: Request, response: Response, user_data: UserRegister, db: DBSession = Depends(get_db)):
    """Register a new user."""
    # Validate acknowledgements - all must be True
    if not user_data.acknowledge_not_medical_advice:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must acknowledge that AretaCare is not medical advice"
        )

    if not user_data.acknowledge_beta_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must acknowledge the beta version status and potential data loss"
        )

    if not user_data.acknowledge_email_communications:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must acknowledge that you will receive email communications"
        )

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hashed_password
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Check for pending invitations and auto-add to sessions
    from app.models.pending_invitation import PendingInvitation
    from app.models.session_collaborator import SessionCollaborator

    pending_invitations = db.query(PendingInvitation).filter(
        PendingInvitation.email == user_data.email
    ).all()

    # If an invitation token was provided, validate it
    if user_data.invitation_token and pending_invitations:
        token_valid = any(inv.token == user_data.invitation_token for inv in pending_invitations)
        if not token_valid:
            # Token doesn't match any pending invitation - log security event
            logger.warning(f"Invalid invitation token provided during registration for email: {user_data.email}")
            # Don't fail registration, but don't process invitations with invalid token
            pending_invitations = []

    if pending_invitations:
        # Filter out expired invitations (older than 30 days)
        now = datetime.utcnow()
        valid_invitations = []
        expired_invitations = []

        for invitation in pending_invitations:
            days_old = (now - invitation.created_at).days
            if days_old >= 30:
                expired_invitations.append(invitation)
            else:
                valid_invitations.append(invitation)

        # Delete expired invitations
        for invitation in expired_invitations:
            db.delete(invitation)
            logger.info(f"Deleted expired invitation for {invitation.email} to session {invitation.session_id}")

        # Add user as collaborator to all valid invited sessions
        sessions_joined = []  # Track sessions for notification emails
        for invitation in valid_invitations:
            # Check if session still exists
            invited_session = db.query(Session).filter(Session.id == invitation.session_id).first()
            if invited_session:
                # Create collaborator record
                collaborator = SessionCollaborator(
                    session_id=invitation.session_id,
                    user_id=new_user.id
                )
                db.add(collaborator)

                # Get session owner info for notification email
                owner = db.query(User).filter(User.id == invited_session.owner_id).first()
                if owner:
                    sessions_joined.append({
                        'session_name': invited_session.name,
                        'owner_email': owner.email,
                        'owner_name': owner.name
                    })

        # Delete all processed valid invitations
        for invitation in valid_invitations:
            db.delete(invitation)

        db.commit()

        # Send notification emails to session owners
        for session_info in sessions_joined:
            try:
                email_service.send_invitation_accepted_email(
                    owner_email=session_info['owner_email'],
                    owner_name=session_info['owner_name'],
                    new_user_name=new_user.name,
                    new_user_email=new_user.email,
                    session_name=session_info['session_name']
                )
            except Exception as e:
                logger.error(f"Failed to send invitation accepted email: {str(e)}")

    # Create initial session for the new user
    initial_session = Session(
        user_id=new_user.id,
        owner_id=new_user.id,
        name="Session 1"
    )
    db.add(initial_session)

    # Set as user's last active session
    new_user.last_active_session_id = initial_session.id
    db.commit()
    db.refresh(new_user)

    # Create access token
    access_token = create_access_token(data={"sub": new_user.id})

    # Create refresh token
    device_info = request.headers.get("user-agent")
    ip_address = security_service.get_client_ip(request)
    refresh_token, _ = create_refresh_token_record(
        db=db,
        user_id=new_user.id,
        device_info=device_info,
        ip_address=ip_address
    )

    # Set refresh token as HttpOnly cookie for security
    # Note: refresh_token is NOT returned in body to prevent XSS attacks from stealing it
    set_refresh_token_cookie(response, refresh_token)

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(new_user)
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(RateLimits.LOGIN)
def login(request: Request, response: Response, user_data: UserLogin, db: DBSession = Depends(get_db)):
    """Login user and return access token."""
    ip_address = security_service.get_client_ip(request)
    user_agent = security_service.get_user_agent(request)

    # Check for account lockout before processing login
    lockout_status = security_service.check_account_lockout(
        db=db,
        email=user_data.email,
        ip_address=ip_address
    )

    if lockout_status["is_locked"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to too many failed login attempts. Please try again in 15 minutes."
        )

    # Helper to get appropriate error message after failed login
    def get_failed_login_message(failed_attempts: int, threshold: int) -> str:
        attempts_remaining = threshold - failed_attempts
        if attempts_remaining == 1:
            return (
                "Incorrect email or password. "
                "Warning: One more failed attempt will lock your account for 15 minutes. "
                "Forgot your password? Use the password reset option."
            )
        elif attempts_remaining <= 0:
            return "Account temporarily locked due to too many failed login attempts. Please try again in 15 minutes."
        else:
            return "Incorrect email or password"

    # Find user by email
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user:
        # Log failed login attempt
        security_service.log_failed_login(
            db=db,
            email=user_data.email,
            ip_address=ip_address,
            user_agent=user_agent
        )

        # Check status after this failure
        new_lockout_status = security_service.check_account_lockout(db, user_data.email, ip_address)
        if new_lockout_status["is_locked"] and new_lockout_status["failed_attempts"] == security_service.LOCKOUT_THRESHOLD:
            security_service.log_account_lockout(db, user_data.email, ip_address, user_agent)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=get_failed_login_message(new_lockout_status["failed_attempts"], new_lockout_status["threshold"])
        )

    # Verify password
    if not verify_password(user_data.password, user.password_hash):
        # Log failed login attempt
        security_service.log_failed_login(
            db=db,
            email=user_data.email,
            ip_address=ip_address,
            user_agent=user_agent
        )

        # Check status after this failure
        new_lockout_status = security_service.check_account_lockout(db, user_data.email, ip_address)
        if new_lockout_status["is_locked"] and new_lockout_status["failed_attempts"] == security_service.LOCKOUT_THRESHOLD:
            security_service.log_account_lockout(db, user_data.email, ip_address, user_agent)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=get_failed_login_message(new_lockout_status["failed_attempts"], new_lockout_status["threshold"])
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Create access token
    access_token = create_access_token(data={"sub": user.id})

    # Create refresh token
    device_info = request.headers.get("user-agent")
    ip_address_for_token = security_service.get_client_ip(request)
    refresh_token, _ = create_refresh_token_record(
        db=db,
        user_id=user.id,
        device_info=device_info,
        ip_address=ip_address_for_token
    )

    # Set refresh token as HttpOnly cookie for security
    # Note: refresh_token is NOT returned in body to prevent XSS attacks from stealing it
    set_refresh_token_cookie(response, refresh_token)

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return UserResponse.model_validate(current_user)


@router.put("/name", response_model=UserResponse)
def update_name(
    data: UpdateName,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Update user name (requires password verification)."""
    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )

    # Update name
    current_user.name = data.name
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.put("/email")
def request_email_change(
    data: UpdateEmail,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Request email change (requires password verification). Logs user out for security.

    This initiates email verification - a verification link is sent to the new email address.
    The email is not changed until the user clicks the verification link.
    """
    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )

    # Check if new email is the same as current
    if data.email.lower() == current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New email must be different from current email"
        )

    # Check if new email is already taken by another user
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user and existing_user.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Generate secure verification token
    verification_token = secrets.token_urlsafe(32)

    # Store pending email and token
    current_user.pending_email = data.email
    current_user.email_change_token = verification_token
    current_user.email_change_token_expires = datetime.utcnow() + timedelta(hours=1)  # 1 hour expiration

    db.commit()

    # Send verification email to the new email address
    email_service.send_email_change_verification(data.email, current_user.name, verification_token)

    # Revoke all refresh tokens and clear cookie (security best practice)
    revoke_all_user_tokens(db, current_user.id)
    clear_refresh_token_cookie(response)

    return {
        "message": "Verification email sent. Please check your new email to complete the change. You will be logged out for security.",
        "pending_email": data.email,
        "logout": True
    }


@router.post("/email/verify")
def verify_email_change(
    request: Request,
    response: Response,
    token: str = Query(..., description="Email verification token"),
    db: DBSession = Depends(get_db)
):
    """
    Verify and complete email change using the verification token.

    This endpoint is called when the user clicks the verification link in the email.
    Logs user out for security after email change.
    """
    # Find user with this verification token
    user = db.query(User).filter(User.email_change_token == token).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )

    # Check if token is expired
    if not user.email_change_token_expires or user.email_change_token_expires < datetime.utcnow():
        # Clear expired token
        user.pending_email = None
        user.email_change_token = None
        user.email_change_token_expires = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link has expired. Please request a new email change."
        )

    # Check if pending email still doesn't exist for another user
    if user.pending_email:
        existing_user = db.query(User).filter(User.email == user.pending_email).first()
        if existing_user and existing_user.id != user.id:
            # Clear the pending change
            user.pending_email = None
            user.email_change_token = None
            user.email_change_token_expires = None
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email address is now registered to another account"
            )

    # Store old email for notification
    old_email = user.email
    new_email = user.pending_email

    # Complete the email change
    user.email = new_email
    user.pending_email = None
    user.email_change_token = None
    user.email_change_token_expires = None

    db.commit()

    # Send notification to old email address
    email_service.send_email_changed_notification(old_email, new_email, user.name)

    # Log security event
    security_service.log_event(
        db=db,
        event_type="email_changed",
        email=new_email,
        user_id=user.id,
        ip_address=security_service.get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        endpoint=request.url.path,
        details=f"Email changed from {old_email} to {new_email}"
    )

    # Revoke all refresh tokens and clear cookie (security best practice)
    revoke_all_user_tokens(db, user.id)
    clear_refresh_token_cookie(response)

    return {
        "message": "Email address successfully changed. Please log in again.",
        "email": new_email,
        "logout": True
    }


@router.delete("/email/pending")
def cancel_email_change(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Cancel a pending email change request."""
    if not current_user.pending_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending email change to cancel"
        )

    current_user.pending_email = None
    current_user.email_change_token = None
    current_user.email_change_token_expires = None
    db.commit()

    return {"message": "Pending email change cancelled"}


@router.put("/password")
def update_password(
    data: UpdatePassword,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Update user password (requires current password verification). Logs user out for security."""
    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )

    # Hash and update password
    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()

    # Send password changed notification email
    email_service.send_password_changed_email(current_user.email, current_user.name)

    # Revoke all refresh tokens and clear cookie (security best practice)
    revoke_all_user_tokens(db, current_user.id)
    clear_refresh_token_cookie(response)

    return {
        "message": "Password updated successfully. Please log in again.",
        "logout": True
    }


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    data: DeleteAccount,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Delete user account permanently (requires password verification)."""
    # Verify password
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )

    # Get all sessions owned by this user (not just created by them)
    # Only delete sessions where the user is the current owner
    user_sessions = db.query(Session).filter(Session.owner_id == current_user.id).all()

    # Delete all S3 files for all owned sessions before deleting database records
    for session in user_sessions:
        # Delete all documents and their thumbnails from S3
        documents = db.query(Document).filter(Document.session_id == session.id).all()
        for doc in documents:
            # Delete main document file
            try:
                await s3_service.delete_file(doc.s3_key)
                logger.info(f"Deleted S3 file during account deletion: {doc.s3_key}")
            except Exception as e:
                logger.error(f"Failed to delete S3 file {doc.s3_key} during account deletion: {str(e)}")
                # Continue deleting other files even if one fails

            # Delete thumbnail file if it exists
            if doc.thumbnail_s3_key:
                try:
                    await s3_service.delete_file(doc.thumbnail_s3_key)
                    logger.info(f"Deleted S3 thumbnail during account deletion: {doc.thumbnail_s3_key}")
                except Exception as e:
                    logger.error(f"Failed to delete S3 thumbnail {doc.thumbnail_s3_key} during account deletion: {str(e)}")

        # Delete all audio recordings from S3
        audio_recordings = db.query(AudioRecording).filter(AudioRecording.session_id == session.id).all()
        for audio in audio_recordings:
            try:
                await s3_service.delete_file(audio.s3_key)
                logger.info(f"Deleted S3 audio file during account deletion: {audio.s3_key}")
            except Exception as e:
                logger.error(f"Failed to delete S3 audio file {audio.s3_key} during account deletion: {str(e)}")

    # Manually delete owned sessions first (before deleting user)
    # This prevents CASCADE from deleting sessions where user was creator but transferred ownership
    for session in user_sessions:
        db.delete(session)

    # Remove user from any collaborative sessions (as collaborator)
    # This happens via SessionCollaborator CASCADE when we delete the user

    # Delete user (cascades to remaining related data)
    # Note: We already deleted owned sessions above, so CASCADE won't affect transferred sessions
    db.delete(current_user)
    db.commit()


@router.post("/password-reset/request", status_code=status.HTTP_200_OK)
@limiter.limit(RateLimits.PASSWORD_RESET_REQUEST)
def request_password_reset(request: Request, data: PasswordResetRequest, db: DBSession = Depends(get_db)):
    """Request a password reset token and send email."""
    # Find user by email
    user = db.query(User).filter(User.email == data.email).first()

    # Don't reveal if user exists or not (security best practice)
    if not user:
        return {"message": "If an account exists with this email, a password reset link has been sent."}

    # Generate secure reset token
    reset_token = secrets.token_urlsafe(32)
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)  # 1 hour expiration

    db.commit()

    # Send password reset email
    email_sent = email_service.send_password_reset_email(user.email, reset_token)

    # Always return the same response (don't reveal if email was sent)
    return {
        "message": "If an account exists with this email, a password reset link has been sent."
    }


@router.post("/password-reset/reset", status_code=status.HTTP_200_OK)
@limiter.limit(RateLimits.PASSWORD_RESET)
def reset_password(request: Request, data: PasswordReset, db: DBSession = Depends(get_db)):
    """Reset password using a valid reset token."""
    # Find user with this reset token
    user = db.query(User).filter(User.reset_token == data.token).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    # Check if token is expired
    if not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    # Update password and clear reset token
    user.password_hash = get_password_hash(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None

    db.commit()

    # Send password changed notification email
    email_service.send_password_changed_email(user.email, user.name)

    # Revoke all refresh tokens when password is reset (security best practice)
    revoke_all_user_tokens(db, user.id)

    return {"message": "Password reset successful"}


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(RateLimits.LOGIN)  # Use same rate limit as login
def refresh_access_token(
    request: Request,
    response: Response,
    data: Optional[RefreshTokenRequest] = None,
    refresh_token_cookie: Optional[str] = Cookie(None, alias=REFRESH_TOKEN_COOKIE_NAME),
    db: DBSession = Depends(get_db)
):
    """
    Refresh an access token using a valid refresh token.

    This endpoint implements REFRESH TOKEN ROTATION for enhanced security:
    - The old refresh token is revoked immediately after use
    - A new refresh token is generated and returned via HttpOnly cookie
    - If a token is reused after rotation, it indicates potential theft

    The refresh token can be provided via:
    1. HttpOnly cookie (preferred, more secure)
    2. Request body (deprecated, for backward compatibility only)
    """
    # Get refresh token from cookie first, then fall back to body
    refresh_token_value = refresh_token_cookie
    if not refresh_token_value and data and data.refresh_token:
        refresh_token_value = data.refresh_token

    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required"
        )

    # Verify the refresh token
    token_record = verify_refresh_token(db, refresh_token_value)

    if not token_record:
        # Clear invalid cookie if present
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    # Get the user
    user = db.query(User).filter(User.id == token_record.user_id).first()
    if not user or not user.is_active:
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    # REFRESH TOKEN ROTATION: Revoke the old token immediately
    # This ensures each refresh token can only be used once
    revoke_refresh_token(db, token_record.id)

    # Create a new access token
    access_token = create_access_token(data={"sub": user.id})

    # Create a NEW refresh token (rotation)
    device_info = request.headers.get("user-agent")
    ip_address = security_service.get_client_ip(request)
    new_refresh_token, _ = create_refresh_token_record(
        db=db,
        user_id=user.id,
        device_info=device_info,
        ip_address=ip_address
    )

    # Set the NEW refresh token cookie
    # Note: refresh_token is NOT returned in body to prevent XSS attacks from stealing it
    set_refresh_token_cookie(response, new_refresh_token)

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user)
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    response: Response,
    refresh_token_cookie: Optional[str] = Cookie(None, alias=REFRESH_TOKEN_COOKIE_NAME),
    db: DBSession = Depends(get_db)
):
    """
    Logout the current session by clearing the refresh token cookie.

    This endpoint clears the HttpOnly refresh token cookie and optionally
    revokes the token from the database if valid.
    """
    # Clear the refresh token cookie
    clear_refresh_token_cookie(response)

    # If a valid refresh token was provided, revoke it from the database
    if refresh_token_cookie:
        from app.models.refresh_token import RefreshToken
        token_record = db.query(RefreshToken).filter(
            RefreshToken.token == refresh_token_cookie,
            RefreshToken.is_revoked == False
        ).first()
        if token_record:
            token_record.is_revoked = True
            db.commit()

    return {"message": "Logged out successfully"}


@router.post("/logout-everywhere", status_code=status.HTTP_200_OK)
def logout_everywhere(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Revoke all refresh tokens for the current user.

    This logs the user out of all devices by invalidating all their refresh tokens.
    The user will need to log in again on all devices.
    """
    # Clear the refresh token cookie for this device
    clear_refresh_token_cookie(response)

    # Revoke all refresh tokens for this user
    count = revoke_all_user_tokens(db, current_user.id)

    return {
        "message": f"Logged out of {count} device(s)",
        "devices_logged_out": count
    }
