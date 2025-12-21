from pydantic import BaseModel, EmailStr, Field
from datetime import datetime


class UserRegister(BaseModel):
    """Schema for user registration."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    acknowledge_not_medical_advice: bool = Field(..., description="User acknowledges AretaCare is not medical advice")
    acknowledge_hipaa: bool = Field(..., description="User acknowledges HIPAA limitations")
    acknowledge_email_communications: bool = Field(..., description="User acknowledges they will receive email communications")
    agree_to_terms: bool = Field(..., description="User agrees to Terms of Service and Privacy Policy")
    invitation_token: str | None = Field(None, description="Optional invitation token for accepting session invitations")


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Schema for user response."""
    id: str
    name: str
    email: str
    is_active: bool
    created_at: datetime
    last_active_session_id: str | None = None
    pending_email: str | None = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for token response.

    Note: refresh_token is no longer returned in the response body for security.
    It is only sent via HttpOnly cookie to prevent XSS attacks from stealing it.
    """
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request.

    Note: refresh_token in body is deprecated. The HttpOnly cookie is the
    primary mechanism. This field is kept for backward compatibility during
    migration but will be ignored if the cookie is present.
    """
    refresh_token: str | None = None


class UpdateName(BaseModel):
    """Schema for updating user name."""
    name: str = Field(..., min_length=1, max_length=255)
    current_password: str


class UpdateEmail(BaseModel):
    """Schema for updating user email."""
    email: EmailStr
    current_password: str


class UpdatePassword(BaseModel):
    """Schema for updating user password."""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=72)


class DeleteAccount(BaseModel):
    """Schema for deleting user account."""
    password: str


class PasswordResetRequest(BaseModel):
    """Schema for requesting password reset."""
    email: EmailStr


class PasswordReset(BaseModel):
    """Schema for resetting password."""
    token: str
    new_password: str = Field(..., min_length=8, max_length=72)


class RegistrationResponse(BaseModel):
    """Schema for registration response (before email verification)."""
    message: str
    email: str


class ResendVerificationRequest(BaseModel):
    """Schema for requesting verification email resend."""
    email: EmailStr
