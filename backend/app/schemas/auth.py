from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
import re

# Display-name validator. Allows Unicode letters/digits, whitespace, and a small
# set of common punctuation (apostrophes, hyphens, dots, commas, parentheses).
# Rejects: HTML-special characters (<, >, &, "), control characters, newlines,
# carriage returns, semicolons, and anything else that could be weaponised as:
#   - XSS in email templates and admin UIs (BI-1)
#   - CRLF injection in email Subject / Reply-To headers (BI-2)
# Capped at 80 chars instead of 255 — long names are almost always abuse.
_DISPLAY_NAME_RE = re.compile(r"^[\w\s\-'.,()]{1,80}$", re.UNICODE)


def _validate_display_name(value: str) -> str:
    """Reject display names with HTML/CRLF/control characters."""
    if value is None:
        return value
    stripped = value.strip()
    if not stripped:
        raise ValueError("Name cannot be empty or whitespace only.")
    # Reject control characters / line breaks explicitly (defense in depth — these
    # would also fail the regex, but a clear error message helps debugging).
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in stripped):
        raise ValueError("Name contains control characters.")
    if not _DISPLAY_NAME_RE.fullmatch(stripped):
        raise ValueError(
            "Name may only contain letters, digits, spaces, and the punctuation "
            "characters - ' . , ( ). HTML and special characters are not allowed."
        )
    return stripped


class UserRegister(BaseModel):
    """Schema for user registration."""
    name: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)

    @field_validator("name")
    @classmethod
    def _name_validator(cls, v: str) -> str:
        return _validate_display_name(v)
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
    name: str = Field(..., min_length=1, max_length=80)
    current_password: str

    @field_validator("name")
    @classmethod
    def _name_validator(cls, v: str) -> str:
        return _validate_display_name(v)


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
