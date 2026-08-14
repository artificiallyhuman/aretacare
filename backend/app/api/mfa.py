"""
MFA (Multi-Factor Authentication) API Endpoints

Provides endpoints for:
- MFA status and management
- Passkey (WebAuthn) registration and authentication
- TOTP setup and verification
- Backup codes generation
- Trusted device management
- Sensitive action re-authentication
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import verify_password
from app.api.auth import get_current_user, verify_mfa_for_sensitive_action
from app.core.rate_limit import limiter
from app.models.user import User
from app.services.mfa_service import MFAService
from app.services.security_service import security_service
from app.services.email_service import EmailService
from app.schemas.mfa import (
    MFAStatusResponse,
    TOTPSetupResponse, TOTPVerifyRequest, TOTPVerifyResponse,
    BackupCodesResponse, BackupCodesCountResponse, BackupCodeVerifyRequest,
    PasskeyRegistrationOptionsResponse, PasskeyRegistrationVerifyRequest, PasskeyRegistrationVerifyResponse,
    PasskeyListResponse, PasskeyInfo, PasskeyAuthenticationOptionsResponse,
    TrustedDeviceListResponse, TrustedDeviceInfo, TrustedDeviceRevokeResponse,
    EnableMFARequest, EnableMFAResponse,
    DisableMFARequest, DisableMFAResponse,
    VerifyForActionRequest, VerifyForActionResponse,
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mfa", tags=["mfa"])


# ==========================================
# MFA Status
# ==========================================

@router.get("/status", response_model=MFAStatusResponse)
def get_mfa_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current MFA configuration status for the user."""
    status = MFAService.get_mfa_status(db, current_user)
    return MFAStatusResponse(**status)


# ==========================================
# TOTP Endpoints
# ==========================================

@router.post("/totp/setup", response_model=TOTPSetupResponse)
@limiter.limit("10/hour")
def setup_totp(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate a new TOTP secret for authenticator app setup.
    Returns the secret and a provisioning URI for QR code generation.
    """
    secret, provisioning_uri = MFAService.setup_totp(db, current_user)

    return TOTPSetupResponse(
        secret=secret,
        provisioning_uri=provisioning_uri
    )


@router.post("/totp/verify-setup", response_model=TOTPVerifyResponse)
@limiter.limit("5/minute")
def verify_totp_setup(
    request: Request,
    data: TOTPVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verify TOTP setup by validating a code from the authenticator app.
    This completes the TOTP enrollment process.
    """
    if MFAService.verify_totp_setup(db, current_user.id, data.code):
        return TOTPVerifyResponse(success=True, message="TOTP setup verified successfully")

    security_service.log_event(
        db=db,
        event_type="mfa_totp_setup_failed",
        user_id=current_user.id,
        email=current_user.email,
        ip_address=security_service.get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
        details="TOTP setup verification failed - invalid code"
    )
    raise HTTPException(status_code=400, detail="Invalid code. Please try again.")


def _notify_mfa_factor_removed(
    db: Session,
    request: Request,
    user: User,
    factor: str,
) -> None:
    """Record a security event when an MFA factor is removed or rotated.

    Enabling and disabling MFA already notify the user; changing an individual factor
    was silent, which is the half an attacker with a stolen access token would use.
    Best-effort — never let notification failure block the user's own action.
    """
    try:
        security_service.log_event(
            db=db,
            event_type="mfa_factor_removed",
            email=user.email,
            user_id=user.id,
            ip_address=security_service.get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            details=f"MFA factor changed: {factor}",
        )
    except Exception as e:  # pragma: no cover - notification must never break the action
        logger.error(f"Failed to log MFA factor removal for user {user.id}: {e}")


def _guard_last_remaining_factor(db: Session, user: User, removing: str) -> None:
    """Refuse to remove the only remaining factor while MFA is still enabled.

    Stripping the last factor leaves `mfa_enabled` true with nothing to satisfy it, so
    login returns `requires_mfa` with an empty method list and the user is locked out.
    Users who genuinely want MFA off should go through /mfa/disable, which requires the
    password and sends a notification.
    """
    if not user.mfa_enabled:
        return

    has_totp = MFAService.has_verified_totp(db, user.id)
    passkey_count = MFAService.get_passkey_count(db, user.id)

    # Count what would still be usable after this removal.
    remaining_totp = has_totp and removing != "totp"
    remaining_passkeys = passkey_count - 1 if removing == "passkey" else passkey_count

    if not remaining_totp and remaining_passkeys <= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "This is your only remaining two-factor method. Add another method first, "
                "or turn off two-factor authentication in Security settings."
            ),
        )


@router.delete("/totp", response_model=TOTPVerifyResponse)
def delete_totp(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove TOTP authentication from the account."""
    # Removing a factor weakens the account, so it needs the same step-up that
    # /mfa/disable requires. Without it, a stolen 1-hour access token is enough to
    # strip every factor off the account.
    #
    # TODO(M-5 re-enable after iOS ships): the enforcement below is temporarily disabled.
    # The App Store build in users' hands does NOT send X-MFA-Action-Token on this route,
    # so enabling it now would 403 MFA-enabled iOS users out of factor management until
    # Apple approves the new build. Re-enable (uncomment both lines) once the iOS release
    # that sends the action token is confirmed live. The web client already sends it.
    # verify_mfa_for_sensitive_action(request, current_user, db)
    # _guard_last_remaining_factor(db, current_user, removing="totp")

    if MFAService.delete_totp(db, current_user.id):
        _notify_mfa_factor_removed(db, request, current_user, "authenticator app")
        return TOTPVerifyResponse(success=True, message="TOTP removed successfully")

    raise HTTPException(status_code=404, detail="No TOTP configuration found")


# ==========================================
# Backup Codes Endpoints
# ==========================================

@router.post("/backup-codes/generate", response_model=BackupCodesResponse)
@limiter.limit("3/hour")
def generate_backup_codes(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate new backup recovery codes.
    This invalidates any existing backup codes.
    Store these codes in a safe place - they are shown only once!
    """
    # Regenerating returns 10 usable second factors in the response body, so it is at
    # least as sensitive as removing one. Without step-up, a stolen access token buys a
    # durable MFA bypass that outlives the token — and silently invalidates the codes the
    # user actually has.
    #
    # TODO(M-5 re-enable after iOS ships): temporarily disabled — see delete_totp above.
    # Old iOS builds don't send X-MFA-Action-Token here. Re-enable once the iOS release is live.
    # verify_mfa_for_sensitive_action(request, current_user, db)

    codes = MFAService.generate_backup_codes(db, current_user.id)
    _notify_mfa_factor_removed(db, request, current_user, "backup codes (regenerated)")

    return BackupCodesResponse(codes=codes, count=len(codes))


@router.get("/backup-codes/count", response_model=BackupCodesCountResponse)
def get_backup_codes_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the number of remaining unused backup codes."""
    count = MFAService.get_remaining_backup_codes_count(db, current_user.id)
    return BackupCodesCountResponse(remaining=count)


# ==========================================
# Passkey Endpoints
# ==========================================

@router.post("/passkey/register/options", response_model=PasskeyRegistrationOptionsResponse)
@limiter.limit("10/hour")
def get_passkey_registration_options(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate WebAuthn registration options for passkey enrollment.
    Returns the options needed to start the browser's WebAuthn registration ceremony.
    """
    try:
        options, _ = MFAService.generate_passkey_registration_options(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return PasskeyRegistrationOptionsResponse(options=options)


@router.post("/passkey/register/verify", response_model=PasskeyRegistrationVerifyResponse)
@limiter.limit("10/hour")
def verify_passkey_registration(
    request: Request,
    data: PasskeyRegistrationVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Complete passkey registration by verifying the WebAuthn credential.
    """
    passkey = MFAService.verify_passkey_registration(
        db, current_user, data.credential, data.device_name
    )

    if passkey:
        # Send email notification
        EmailService.send_new_passkey_email(
            to_email=current_user.email,
            user_name=current_user.name,
            device_name=data.device_name
        )

        return PasskeyRegistrationVerifyResponse(
            success=True,
            passkey_id=passkey.id,
            device_name=passkey.device_name
        )

    security_service.log_event(
        db=db,
        event_type="mfa_passkey_registration_failed",
        user_id=current_user.id,
        email=current_user.email,
        ip_address=security_service.get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
        details="Passkey registration verification failed"
    )
    raise HTTPException(status_code=400, detail="Failed to register passkey. Please try again.")


@router.get("/passkeys", response_model=PasskeyListResponse)
def list_passkeys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all registered passkeys for the user."""
    passkeys = MFAService.list_passkeys(db, current_user.id)
    return PasskeyListResponse(
        passkeys=[PasskeyInfo(**pk) for pk in passkeys]
    )


@router.delete("/passkeys/{passkey_id}")
def delete_passkey(
    passkey_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a specific passkey."""
    # Same reasoning as delete_totp: removing a factor is a sensitive action.
    #
    # TODO(M-5 re-enable after iOS ships): temporarily disabled — see delete_totp above.
    # Old iOS builds don't send X-MFA-Action-Token here. Re-enable once the iOS release is live.
    # verify_mfa_for_sensitive_action(request, current_user, db)
    # _guard_last_remaining_factor(db, current_user, removing="passkey")

    if MFAService.delete_passkey(db, current_user.id, passkey_id):
        _notify_mfa_factor_removed(db, request, current_user, "passkey")
        return {"success": True, "message": "Passkey removed successfully"}

    raise HTTPException(status_code=404, detail="Passkey not found")


# ==========================================
# Trusted Devices Endpoints
# ==========================================

@router.get("/trusted-devices", response_model=TrustedDeviceListResponse)
def list_trusted_devices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all trusted devices for the user."""
    devices = MFAService.list_trusted_devices(db, current_user.id)
    return TrustedDeviceListResponse(
        devices=[TrustedDeviceInfo(**d) for d in devices]
    )


@router.delete("/trusted-devices/{device_id}", response_model=TrustedDeviceRevokeResponse)
def revoke_trusted_device(
    device_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke trust for a specific device."""
    if MFAService.revoke_trusted_device(db, current_user.id, device_id):
        return TrustedDeviceRevokeResponse(success=True, message="Device trust revoked")

    raise HTTPException(status_code=404, detail="Trusted device not found")


@router.delete("/trusted-devices", response_model=TrustedDeviceRevokeResponse)
def revoke_all_trusted_devices(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoke trust for all devices."""
    count = MFAService.revoke_all_trusted_devices(db, current_user.id)

    return TrustedDeviceRevokeResponse(
        success=True,
        message=f"Revoked {count} trusted device(s)",
        revoked_count=count
    )


# ==========================================
# MFA Management Endpoints
# ==========================================

@router.post("/enable", response_model=EnableMFAResponse)
def enable_mfa(
    request: Request,
    data: EnableMFARequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Enable MFA for the user.
    Requires at least one MFA method (passkey or TOTP) to be configured first.
    """
    if MFAService.enable_mfa(db, current_user, data.preferred_method):
        # Send email notification
        EmailService.send_mfa_enabled_email(
            to_email=current_user.email,
            user_name=current_user.name,
            method=data.preferred_method
        )

        return EnableMFAResponse(success=True, message="MFA enabled successfully")

    raise HTTPException(
        status_code=400,
        detail="Cannot enable MFA. Please configure at least one MFA method first."
    )


@router.post("/disable", response_model=DisableMFAResponse)
def disable_mfa(
    request: Request,
    data: DisableMFARequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Disable MFA for the user.
    Requires password verification.
    This removes all MFA data (passkeys, TOTP, backup codes, trusted devices).
    """
    # Verify password
    if not verify_password(data.password, current_user.password_hash):
        security_service.log_event(
            db=db,
            event_type="mfa_disable_failed",
            user_id=current_user.id,
            email=current_user.email,
            ip_address=security_service.get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
            details="MFA disable attempt failed - incorrect password"
        )
        raise HTTPException(status_code=401, detail="Incorrect password")

    MFAService.disable_mfa(db, current_user)

    # Send email notification (important security alert)
    EmailService.send_mfa_disabled_email(
        to_email=current_user.email,
        user_name=current_user.name
    )

    return DisableMFAResponse(success=True, message="MFA disabled successfully")


# ==========================================
# Sensitive Action Re-authentication
# ==========================================

@router.post("/verify-for-action", response_model=VerifyForActionResponse)
@limiter.limit("5/minute")
def verify_for_sensitive_action(
    request: Request,
    data: VerifyForActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verify MFA for sensitive actions (password change, email change, etc.).
    Returns an action token to be included in the X-MFA-Action-Token header.
    """
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is not enabled for this account")

    verified = False

    if data.method == "passkey":
        if data.credential:
            verified = MFAService.verify_passkey_authentication(db, current_user.id, data.credential)
    elif data.method == "totp":
        if data.code:
            verified = MFAService.verify_totp(db, current_user.id, data.code)
    elif data.method == "backup_code":
        if data.code:
            verified = MFAService.verify_backup_code(db, current_user.id, data.code)

    if verified:
        action_token = MFAService.create_action_token(db, current_user.id)

        return VerifyForActionResponse(
            success=True,
            action_token=action_token,
            message="MFA verification successful"
        )

    security_service.log_event(
        db=db,
        event_type="mfa_action_verification_failed",
        user_id=current_user.id,
        email=current_user.email,
        ip_address=security_service.get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
        details=f"MFA verification for sensitive action failed (method: {data.method})"
    )

    raise HTTPException(status_code=401, detail="MFA verification failed")


# ==========================================
# Passkey Authentication (for re-auth flow)
# ==========================================

@router.post("/passkey/auth/options", response_model=PasskeyAuthenticationOptionsResponse)
def get_passkey_authentication_options(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate WebAuthn authentication options for passkey verification.
    Used for re-authentication during sensitive actions.
    """
    options, _ = MFAService.generate_passkey_authentication_options(db, current_user.id)

    if options is None:
        raise HTTPException(status_code=404, detail="No passkeys registered")

    return PasskeyAuthenticationOptionsResponse(options=options)
