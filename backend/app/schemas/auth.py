from pydantic import BaseModel, EmailStr, Field
from datetime import datetime


class UserRegister(BaseModel):
    """Schema for user registration."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    acknowledge_not_medical_advice: bool = Field(..., description="User acknowledges AretaCare is not medical advice")
    acknowledge_hipaa: bool = Field(..., description="User acknowledges HIPAA limitations")
    acknowledge_ai_processing: bool = Field(..., description="User acknowledges AI processing of their information")
    agree_to_terms: bool = Field(..., description="User agrees to Terms of Service and Privacy Policy")
    acknowledge_age_and_use: bool = Field(..., description="User confirms they are 18+, reside in the US, and will use for lawful purposes")
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
    has_ai_data_sharing_consent: bool = False

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for token response.

    Note: refresh_token is only returned in the response body for iOS clients
    (identified by X-Client-Type: ios header) which store it in Keychain.
    Web clients receive it only via HttpOnly cookie to prevent XSS attacks.
    """
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    refresh_token: str | None = None


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


class MFARequiredResponse(BaseModel):
    """Response when login requires MFA verification."""
    requires_mfa: bool = True
    mfa_token: str = Field(..., description="Token to use for MFA verification")
    mfa_methods: list[str] = Field(..., description="Available MFA methods: passkey, totp, backup_code")


class LoginResponse(BaseModel):
    """
    Unified login response that can be either:
    - Full TokenResponse (when MFA not enabled or device trusted)
    - MFARequiredResponse (when MFA verification needed)
    """
    # Token fields (present when login succeeds without MFA)
    access_token: str | None = None
    token_type: str = "bearer"
    user: UserResponse | None = None

    # MFA fields (present when MFA verification is required)
    requires_mfa: bool = False
    mfa_token: str | None = None
    mfa_methods: list[str] | None = None

    # iOS-only fields (included when X-Client-Type: ios header is present)
    refresh_token: str | None = None
    trusted_device_token: str | None = None
