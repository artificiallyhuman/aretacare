from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session as DBSession
from typing import Optional
from datetime import datetime, timedelta
import secrets
import logging

from app.core.database import get_db
from app.core.auth import verify_password, get_password_hash, create_access_token, decode_access_token
from app.core.config import settings
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

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: DBSession = Depends(get_db)
) -> User:
    """Get the current authenticated user from JWT token."""
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
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
def register(user_data: UserRegister, db: DBSession = Depends(get_db)):
    """Register a new user."""
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

    # Create access token
    access_token = create_access_token(data={"sub": new_user.id})

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(new_user)
    )


@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin, db: DBSession = Depends(get_db)):
    """Login user and return access token."""
    # Find user by email
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Verify password
    if not verify_password(user_data.password, user.password_hash):
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

    # Update email
    current_user.email = data.email
    db.commit()
    db.refresh(current_user)

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

    return UserResponse.model_validate(current_user)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
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

    # Get all sessions for this user
    user_sessions = db.query(Session).filter(Session.user_id == current_user.id).all()

    # Delete all S3 files for all sessions before deleting database records
    for session in user_sessions:
        # Delete all documents and their thumbnails from S3
        documents = db.query(Document).filter(Document.session_id == session.id).all()
        for doc in documents:
            # Delete main document file
            try:
                s3_service.delete_file(doc.s3_key)
                logger.info(f"Deleted S3 file during account deletion: {doc.s3_key}")
            except Exception as e:
                logger.error(f"Failed to delete S3 file {doc.s3_key} during account deletion: {str(e)}")
                # Continue deleting other files even if one fails

            # Delete thumbnail file if it exists
            if doc.thumbnail_s3_key:
                try:
                    s3_service.delete_file(doc.thumbnail_s3_key)
                    logger.info(f"Deleted S3 thumbnail during account deletion: {doc.thumbnail_s3_key}")
                except Exception as e:
                    logger.error(f"Failed to delete S3 thumbnail {doc.thumbnail_s3_key} during account deletion: {str(e)}")

        # Delete all audio recordings from S3
        audio_recordings = db.query(AudioRecording).filter(AudioRecording.session_id == session.id).all()
        for audio in audio_recordings:
            try:
                s3_service.delete_file(audio.s3_key)
                logger.info(f"Deleted S3 audio file during account deletion: {audio.s3_key}")
            except Exception as e:
                logger.error(f"Failed to delete S3 audio file {audio.s3_key} during account deletion: {str(e)}")

    # Delete user (cascades to all related data in database: sessions, documents, conversations,
    # journal entries, audio recordings, daily plans)
    db.delete(current_user)
    db.commit()


@router.post("/password-reset/request", status_code=status.HTTP_200_OK)
def request_password_reset(data: PasswordResetRequest, db: DBSession = Depends(get_db)):
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
def reset_password(data: PasswordReset, db: DBSession = Depends(get_db)):
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

    return {"message": "Password reset successful"}
