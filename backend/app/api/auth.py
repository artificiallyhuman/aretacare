from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session as DBSession
from typing import Optional
from datetime import datetime, timedelta
import secrets
import logging

from app.core.database import get_db
from app.core.auth import verify_password, get_password_hash, create_access_token, decode_access_token
from app.core.config import settings
from app.core.rate_limit import limiter, RateLimits
from app.models.user import User
from app.models.session import Session
from app.models.document import Document
from app.models.audio_recording import AudioRecording
from app.schemas.auth import (
    UserRegister, UserLogin, TokenResponse, UserResponse,
    UpdateName, UpdateEmail, UpdatePassword, DeleteAccount,
    PasswordResetRequest, PasswordReset
)
from app.services.email_service import email_service
from app.services.s3_service import s3_service
from app.services.security_service import security_service

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()


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
def register(request: Request, user_data: UserRegister, db: DBSession = Depends(get_db)):
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

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(new_user)
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(RateLimits.LOGIN)
def login(request: Request, user_data: UserLogin, db: DBSession = Depends(get_db)):
    """Login user and return access token."""
    # Find user by email
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user:
        # Log failed login attempt
        security_service.log_failed_login(
            db=db,
            email=user_data.email,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request)
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Verify password
    if not verify_password(user_data.password, user.password_hash):
        # Log failed login attempt
        security_service.log_failed_login(
            db=db,
            email=user_data.email,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request)
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Create access token
    access_token = create_access_token(data={"sub": user.id})

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
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )

    # Update name
    current_user.name = data.name
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.put("/email", response_model=UserResponse)
def update_email(
    data: UpdateEmail,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Update user email (requires password verification)."""
    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )

    # Check if new email is already taken
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user and existing_user.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Store old email for notification
    old_email = current_user.email

    # Update email
    current_user.email = data.email
    db.commit()
    db.refresh(current_user)

    # Send notification to old email address
    email_service.send_email_changed_notification(old_email, data.email, current_user.name)

    return UserResponse.model_validate(current_user)


@router.put("/password", response_model=UserResponse)
def update_password(
    data: UpdatePassword,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Update user password (requires current password verification)."""
    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )

    # Hash and update password
    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()
    db.refresh(current_user)

    # Send password changed notification email
    email_service.send_password_changed_email(current_user.email, current_user.name)

    return UserResponse.model_validate(current_user)


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
            status_code=status.HTTP_401_UNAUTHORIZED,
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

    return {"message": "Password reset successful"}
