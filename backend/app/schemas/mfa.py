"""
MFA (Multi-Factor Authentication) Pydantic Schemas

These schemas define the request/response models for MFA API endpoints.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ==========================================
# MFA Status
# ==========================================

class MFAStatusResponse(BaseModel):
    """Response for GET /mfa/status"""
    mfa_enabled: bool
    preferred_method: Optional[str] = None
    enabled_at: Optional[str] = None
    has_passkeys: bool
    passkey_count: int
    has_totp: bool
    backup_codes_remaining: int
    trusted_devices_count: int


# ==========================================
# TOTP Schemas
# ==========================================

class TOTPSetupResponse(BaseModel):
    """Response for POST /mfa/totp/setup"""
    secret: str = Field(..., description="Base32 TOTP secret for manual entry")
    provisioning_uri: str = Field(..., description="URI for QR code generation")


class TOTPVerifyRequest(BaseModel):
    """Request for POST /mfa/totp/verify-setup and TOTP verification"""
    code: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code")


class TOTPVerifyResponse(BaseModel):
    """Response for TOTP verification endpoints"""
    success: bool
    message: str


# ==========================================
# Backup Codes Schemas
# ==========================================

class BackupCodesResponse(BaseModel):
    """Response for POST /mfa/backup-codes/generate"""
    codes: List[str] = Field(..., description="List of backup codes (save these!)")
    count: int = Field(..., description="Number of codes generated")


class BackupCodesCountResponse(BaseModel):
    """Response for GET /mfa/backup-codes/count"""
    remaining: int = Field(..., description="Number of unused backup codes")


class BackupCodeVerifyRequest(BaseModel):
    """Request for backup code verification"""
    code: str = Field(
        ...,
        min_length=8,
        max_length=9,  # 8 chars or 9 with dash (XXXX-XXXX)
        pattern=r"^[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}$",
        description="Backup code (format: XXXX-XXXX or XXXXXXXX)"
    )


# ==========================================
# Passkey Schemas
# ==========================================

class PasskeyRegistrationOptionsResponse(BaseModel):
    """Response for POST /mfa/passkey/register/options"""
    options: Dict[str, Any] = Field(..., description="WebAuthn registration options")


class PasskeyRegistrationVerifyRequest(BaseModel):
    """Request for POST /mfa/passkey/register/verify"""
    credential: Dict[str, Any] = Field(..., description="WebAuthn credential response")
    device_name: str = Field(..., min_length=1, max_length=100, description="Name for this passkey")


class PasskeyRegistrationVerifyResponse(BaseModel):
    """Response for POST /mfa/passkey/register/verify"""
    success: bool
    passkey_id: Optional[str] = None
    device_name: Optional[str] = None


class PasskeyInfo(BaseModel):
    """Information about a registered passkey"""
    id: str
    device_name: str
    created_at: str
    last_used_at: Optional[str] = None


class PasskeyListResponse(BaseModel):
    """Response for GET /mfa/passkeys"""
    passkeys: List[PasskeyInfo]


class PasskeyAuthenticationOptionsResponse(BaseModel):
    """Response for POST /mfa/passkey/auth/options"""
    options: Dict[str, Any] = Field(..., description="WebAuthn authentication options")


class PasskeyAuthenticationVerifyRequest(BaseModel):
    """Request for passkey authentication verification"""
    credential: Dict[str, Any] = Field(..., description="WebAuthn credential response")


# ==========================================
# Trusted Device Schemas
# ==========================================

class TrustedDeviceInfo(BaseModel):
    """Information about a trusted device"""
    id: str
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    trusted_until: str
    created_at: str
    last_used_at: Optional[str] = None


class TrustedDeviceListResponse(BaseModel):
    """Response for GET /mfa/trusted-devices"""
    devices: List[TrustedDeviceInfo]


class TrustedDeviceRevokeResponse(BaseModel):
    """Response for DELETE /mfa/trusted-devices endpoints"""
    success: bool
    message: str
    revoked_count: Optional[int] = None


# ==========================================
# MFA Management Schemas
# ==========================================

class EnableMFARequest(BaseModel):
    """Request for POST /mfa/enable"""
    preferred_method: str = Field(..., pattern="^(passkey|totp)$", description="Preferred MFA method")


class EnableMFAResponse(BaseModel):
    """Response for POST /mfa/enable"""
    success: bool
    message: str


class DisableMFARequest(BaseModel):
    """Request for POST /mfa/disable"""
    password: str = Field(..., min_length=1, description="Current password for verification")


class DisableMFAResponse(BaseModel):
    """Response for POST /mfa/disable"""
    success: bool
    message: str


# ==========================================
# MFA Verification Schemas (for login flow)
# ==========================================

class MFARequiredResponse(BaseModel):
    """Returned when login requires MFA"""
    requires_mfa: bool = True
    mfa_token: str = Field(..., description="Token to use for MFA verification")
    mfa_methods: List[str] = Field(..., description="Available MFA methods")


class MFAVerifyLoginRequest(BaseModel):
    """Request for POST /auth/login/mfa-verify"""
    mfa_token: str = Field(..., description="MFA token from login response")
    method: str = Field(..., pattern="^(passkey|totp|backup_code)$", description="MFA method used")
    code: Optional[str] = Field(None, description="TOTP or backup code")
    credential: Optional[Dict[str, Any]] = Field(None, description="WebAuthn credential for passkey")
    trust_device: bool = Field(False, description="Whether to trust this device for 30 days")


# ==========================================
# Sensitive Action Verification Schemas
# ==========================================

class VerifyForActionRequest(BaseModel):
    """Request for POST /mfa/verify-for-action"""
    method: str = Field(..., pattern="^(passkey|totp|backup_code)$", description="MFA method used")
    code: Optional[str] = Field(None, description="TOTP or backup code")
    credential: Optional[Dict[str, Any]] = Field(None, description="WebAuthn credential for passkey")


class VerifyForActionResponse(BaseModel):
    """Response for POST /mfa/verify-for-action"""
    success: bool
    action_token: Optional[str] = Field(None, description="Token to include in X-MFA-Action-Token header")
    message: str
