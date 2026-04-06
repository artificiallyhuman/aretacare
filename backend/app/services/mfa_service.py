"""
MFA Service - Core business logic for Multi-Factor Authentication.

Handles:
- Passkey (WebAuthn) registration and verification
- TOTP setup and verification
- Backup code generation and validation
- Trusted device management
- Sensitive action re-authentication
"""
import secrets
import hashlib
import json
import base64
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Tuple, Dict, Any
from sqlalchemy.orm import Session

import pyotp
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    ResidentKeyRequirement,
    AuthenticatorAttachment,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier

from passlib.context import CryptContext

from app.core.mfa_config import (
    TOTP_ISSUER, TOTP_DIGITS, TOTP_INTERVAL, TOTP_WINDOW,
    BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH,
    TRUSTED_DEVICE_DURATION_DAYS, MAX_TRUSTED_DEVICES_PER_USER,
    CHALLENGE_EXPIRY_MINUTES, ACTION_TOKEN_EXPIRY_MINUTES,
    RP_ID, RP_NAME, WEBAUTHN_ORIGIN, USER_VERIFICATION, ATTESTATION,
    MAX_PASSKEYS_PER_USER,
    get_mfa_encryption_key,
)
from app.models.user import User
from app.models.user_passkey import UserPasskey
from app.models.user_totp_secret import UserTOTPSecret
from app.models.user_backup_code import UserBackupCode
from app.models.trusted_device import TrustedDevice
from app.models.mfa_challenge import MFAChallenge

logger = logging.getLogger(__name__)

# Password context for hashing backup codes
backup_code_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class MFAService:
    """Service class for all MFA operations."""

    # ==========================================
    # TOTP Methods
    # ==========================================

    @staticmethod
    def _encrypt_totp_secret(secret: str) -> str:
        """Encrypt a TOTP secret for storage."""
        from cryptography.fernet import Fernet
        key = base64.urlsafe_b64encode(get_mfa_encryption_key())
        f = Fernet(key)
        return f.encrypt(secret.encode()).decode()

    @staticmethod
    def _decrypt_totp_secret(encrypted_secret: str) -> str:
        """Decrypt a TOTP secret from storage."""
        from cryptography.fernet import Fernet
        key = base64.urlsafe_b64encode(get_mfa_encryption_key())
        f = Fernet(key)
        return f.decrypt(encrypted_secret.encode()).decode()

    @staticmethod
    def setup_totp(db: Session, user: User) -> Tuple[str, str]:
        """
        Generate a new TOTP secret for the user, or return existing unverified secret.

        This method is idempotent: if an unverified secret was created within the
        last 5 minutes, it returns that same secret instead of generating a new one.
        This prevents issues with duplicate requests (e.g., React StrictMode).

        Returns:
            Tuple of (raw_secret, provisioning_uri for QR code)
        """
        # Use FOR UPDATE to lock the row and prevent race conditions
        existing = db.query(UserTOTPSecret).filter(
            UserTOTPSecret.user_id == user.id
        ).with_for_update().first()

        # If there's a recent unverified secret (less than 5 minutes old), reuse it
        if existing and not existing.verified:
            age = datetime.utcnow() - existing.created_at
            if age.total_seconds() < 300:  # 5 minutes
                # Return existing secret - makes API idempotent
                secret = MFAService._decrypt_totp_secret(existing.secret_encrypted)
                totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)
                provisioning_uri = totp.provisioning_uri(
                    name=user.email,
                    issuer_name=TOTP_ISSUER
                )
                return secret, provisioning_uri

        # Generate a new secret
        secret = pyotp.random_base32()

        # Create provisioning URI for QR code
        totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)
        provisioning_uri = totp.provisioning_uri(
            name=user.email,
            issuer_name=TOTP_ISSUER
        )

        # Store encrypted secret
        encrypted_secret = MFAService._encrypt_totp_secret(secret)

        if existing:
            # Update existing record
            existing.secret_encrypted = encrypted_secret
            existing.verified = False
            existing.last_used_counter = None
            existing.created_at = datetime.utcnow()
            existing.last_used_at = None
        else:
            # Create new record
            totp_record = UserTOTPSecret(
                user_id=user.id,
                secret_encrypted=encrypted_secret,
                verified=False
            )
            db.add(totp_record)

        db.commit()
        return secret, provisioning_uri

    @staticmethod
    def verify_totp_setup(db: Session, user_id: str, code: str) -> bool:
        """
        Verify the initial TOTP setup with a code from the authenticator app.

        Returns:
            True if verification succeeded, False otherwise
        """
        totp_record = db.query(UserTOTPSecret).filter(
            UserTOTPSecret.user_id == user_id
        ).first()

        if not totp_record:
            return False

        # Decrypt secret and verify code
        secret = MFAService._decrypt_totp_secret(totp_record.secret_encrypted)
        totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)

        if totp.verify(code, valid_window=TOTP_WINDOW):
            totp_record.mark_verified()
            db.commit()
            return True

        return False

    @staticmethod
    def verify_totp(db: Session, user_id: str, code: str) -> bool:
        """
        Verify a TOTP code during login or re-authentication.

        Includes replay protection: the same code cannot be used twice
        within its validity window.

        Returns:
            True if code is valid, False otherwise
        """
        totp_record = db.query(UserTOTPSecret).filter(
            UserTOTPSecret.user_id == user_id,
            UserTOTPSecret.verified == True
        ).first()

        if not totp_record:
            return False

        secret = MFAService._decrypt_totp_secret(totp_record.secret_encrypted)
        totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)

        if totp.verify(code, valid_window=TOTP_WINDOW):
            # Replay protection: check if this time counter was already used
            import time
            current_counter = int(time.time()) // TOTP_INTERVAL

            if totp_record.last_used_counter is not None:
                if current_counter <= totp_record.last_used_counter:
                    # Code already used in this or a previous time window
                    logger.warning(f"TOTP replay attempt detected for user {user_id}")
                    return False

            # Update the counter and timestamp
            totp_record.last_used_counter = current_counter
            totp_record.update_last_used()
            db.commit()
            return True

        return False

    @staticmethod
    def delete_totp(db: Session, user_id: str) -> bool:
        """Remove TOTP configuration for a user."""
        result = db.query(UserTOTPSecret).filter(
            UserTOTPSecret.user_id == user_id
        ).delete()
        db.commit()
        return result > 0

    @staticmethod
    def has_verified_totp(db: Session, user_id: str) -> bool:
        """Check if user has a verified TOTP setup."""
        return db.query(UserTOTPSecret).filter(
            UserTOTPSecret.user_id == user_id,
            UserTOTPSecret.verified == True
        ).first() is not None

    # ==========================================
    # Backup Codes Methods
    # ==========================================

    @staticmethod
    def generate_backup_codes(db: Session, user_id: str) -> List[str]:
        """
        Generate new backup codes for the user.
        Invalidates any existing codes.

        Returns:
            List of plain text backup codes (shown once to user)
        """
        # Delete existing backup codes
        db.query(UserBackupCode).filter(
            UserBackupCode.user_id == user_id
        ).delete()

        # Generate new codes
        codes = []
        for _ in range(BACKUP_CODE_COUNT):
            # Generate a code like "XXXX-XXXX" format
            code = secrets.token_hex(BACKUP_CODE_LENGTH // 2).upper()
            formatted_code = f"{code[:4]}-{code[4:]}"
            codes.append(formatted_code)

            # Hash and store
            code_hash = backup_code_context.hash(formatted_code)
            backup_code = UserBackupCode(
                user_id=user_id,
                code_hash=code_hash
            )
            db.add(backup_code)

        db.commit()
        return codes

    @staticmethod
    def verify_backup_code(db: Session, user_id: str, code: str) -> bool:
        """
        Verify a backup code. If valid, marks it as used.

        Returns:
            True if code is valid and unused, False otherwise
        """
        # Normalize the code (remove dashes, uppercase)
        normalized_code = code.replace("-", "").replace(" ", "").upper()
        # Re-format to expected format
        if len(normalized_code) == BACKUP_CODE_LENGTH:
            formatted_code = f"{normalized_code[:4]}-{normalized_code[4:]}"
        else:
            formatted_code = code.strip()

        # Get all unused backup codes for user
        unused_codes = db.query(UserBackupCode).filter(
            UserBackupCode.user_id == user_id,
            UserBackupCode.used_at == None
        ).all()

        for backup_code in unused_codes:
            if backup_code_context.verify(formatted_code, backup_code.code_hash):
                backup_code.mark_used()
                db.commit()
                return True

        return False

    @staticmethod
    def get_remaining_backup_codes_count(db: Session, user_id: str) -> int:
        """Get the count of unused backup codes."""
        return db.query(UserBackupCode).filter(
            UserBackupCode.user_id == user_id,
            UserBackupCode.used_at == None
        ).count()

    # ==========================================
    # Passkey (WebAuthn) Methods
    # ==========================================

    @staticmethod
    def generate_passkey_registration_options(
        db: Session,
        user: User
    ) -> Tuple[Dict[str, Any], bytes]:
        """
        Generate WebAuthn registration options for passkey enrollment.

        Returns:
            Tuple of (options_dict for frontend, challenge_bytes for storage)

        Raises:
            ValueError: If user has reached the maximum passkey limit
        """
        # Get existing passkey credential IDs to exclude
        existing_passkeys = db.query(UserPasskey).filter(
            UserPasskey.user_id == user.id
        ).all()

        # Check passkey limit
        if len(existing_passkeys) >= MAX_PASSKEYS_PER_USER:
            raise ValueError(f"Maximum of {MAX_PASSKEYS_PER_USER} passkeys allowed per account")

        exclude_credentials = [
            PublicKeyCredentialDescriptor(id=pk.credential_id)
            for pk in existing_passkeys
        ]

        # Generate registration options
        options = generate_registration_options(
            rp_id=RP_ID,
            rp_name=RP_NAME,
            user_id=user.id.encode(),
            user_name=user.email,
            user_display_name=user.name,
            exclude_credentials=exclude_credentials,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            supported_pub_key_algs=[
                COSEAlgorithmIdentifier.ECDSA_SHA_256,
                COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
            ],
            timeout=60000,  # 60 seconds
        )

        # Store the challenge for verification
        challenge_bytes = options.challenge

        # Delete any existing registration challenges for this user (locked to prevent races)
        db.query(MFAChallenge).filter(
            MFAChallenge.user_id == user.id,
            MFAChallenge.challenge_type == 'webauthn_register'
        ).with_for_update().delete()

        # Store new challenge
        challenge_record = MFAChallenge(
            user_id=user.id,
            challenge_type='webauthn_register',
            challenge_data=challenge_bytes,
            expires_at=MFAChallenge.calculate_expiry()
        )
        db.add(challenge_record)
        db.commit()

        # Convert options to JSON-serializable dict
        options_json = json.loads(options_to_json(options))

        return options_json, challenge_bytes

    @staticmethod
    def verify_passkey_registration(
        db: Session,
        user: User,
        credential: Dict[str, Any],
        device_name: str
    ) -> Optional[UserPasskey]:
        """
        Verify and store a new passkey registration.

        Returns:
            The created UserPasskey record, or None if verification failed
        """
        # Get the stored challenge
        challenge_record = db.query(MFAChallenge).filter(
            MFAChallenge.user_id == user.id,
            MFAChallenge.challenge_type == 'webauthn_register'
        ).first()

        if not challenge_record or not challenge_record.is_valid():
            logger.warning(f"No valid registration challenge for user {user.id}")
            return None

        try:
            # Verify the registration response
            verification = verify_registration_response(
                credential=credential,
                expected_challenge=challenge_record.challenge_data,
                expected_rp_id=RP_ID,
                expected_origin=WEBAUTHN_ORIGIN,
            )

            # Extract transports if provided
            transports = None
            if hasattr(credential, 'response') and hasattr(credential['response'], 'transports'):
                transports = json.dumps(credential['response'].get('transports', []))
            elif isinstance(credential, dict) and 'response' in credential:
                transports = json.dumps(credential['response'].get('transports', []))

            # Create passkey record
            passkey = UserPasskey(
                user_id=user.id,
                credential_id=verification.credential_id,
                public_key=verification.credential_public_key,
                counter=verification.sign_count,
                device_name=device_name,
                transports=transports,
                backed_up=verification.credential_backed_up if hasattr(verification, 'credential_backed_up') else False,
            )
            db.add(passkey)

            # Delete the used challenge
            db.delete(challenge_record)
            db.commit()

            return passkey

        except Exception as e:
            logger.error(f"Passkey registration verification failed: {e}")
            return None

    @staticmethod
    def generate_passkey_authentication_options(
        db: Session,
        user_id: str
    ) -> Tuple[Optional[Dict[str, Any]], Optional[bytes]]:
        """
        Generate WebAuthn authentication options for passkey verification.

        Returns:
            Tuple of (options_dict for frontend, challenge_bytes for storage)
            Returns (None, None) if user has no passkeys
        """
        # Get user's passkeys
        passkeys = db.query(UserPasskey).filter(
            UserPasskey.user_id == user_id
        ).all()

        if not passkeys:
            return None, None

        # Build credential descriptors
        allow_credentials = []
        for pk in passkeys:
            transports = None
            if pk.transports:
                try:
                    transport_list = json.loads(pk.transports)
                    transports = [AuthenticatorTransport(t) for t in transport_list if t in ['usb', 'nfc', 'ble', 'internal', 'hybrid']]
                except (json.JSONDecodeError, ValueError):
                    pass

            allow_credentials.append(
                PublicKeyCredentialDescriptor(
                    id=pk.credential_id,
                    transports=transports,
                )
            )

        # Generate authentication options
        options = generate_authentication_options(
            rp_id=RP_ID,
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
            timeout=60000,  # 60 seconds
        )

        challenge_bytes = options.challenge

        # Delete any existing auth challenges for this user (locked to prevent races)
        db.query(MFAChallenge).filter(
            MFAChallenge.user_id == user_id,
            MFAChallenge.challenge_type == 'webauthn_auth'
        ).with_for_update().delete()

        # Store new challenge
        challenge_record = MFAChallenge(
            user_id=user_id,
            challenge_type='webauthn_auth',
            challenge_data=challenge_bytes,
            expires_at=MFAChallenge.calculate_expiry()
        )
        db.add(challenge_record)
        db.commit()

        options_json = json.loads(options_to_json(options))

        return options_json, challenge_bytes

    @staticmethod
    def verify_passkey_authentication(
        db: Session,
        user_id: str,
        credential: Dict[str, Any]
    ) -> bool:
        """
        Verify a passkey authentication response.

        Returns:
            True if authentication succeeded, False otherwise
        """
        # Get the stored challenge
        challenge_record = db.query(MFAChallenge).filter(
            MFAChallenge.user_id == user_id,
            MFAChallenge.challenge_type == 'webauthn_auth'
        ).first()

        if not challenge_record or not challenge_record.is_valid():
            logger.warning(f"No valid auth challenge for user {user_id}")
            return False

        # Get the credential ID from the response
        credential_id_b64 = credential.get('id', '')
        try:
            credential_id = base64.urlsafe_b64decode(credential_id_b64 + '==')
        except Exception:
            logger.error("Failed to decode credential ID")
            return False

        # Find the matching passkey
        passkey = db.query(UserPasskey).filter(
            UserPasskey.user_id == user_id,
            UserPasskey.credential_id == credential_id
        ).first()

        if not passkey:
            logger.warning(f"Passkey not found for user {user_id}")
            return False

        try:
            # Verify the authentication response
            verification = verify_authentication_response(
                credential=credential,
                expected_challenge=challenge_record.challenge_data,
                expected_rp_id=RP_ID,
                expected_origin=WEBAUTHN_ORIGIN,
                credential_public_key=passkey.public_key,
                credential_current_sign_count=passkey.counter,
            )

            # Update the counter
            passkey.update_counter(verification.new_sign_count)

            # Delete the used challenge
            db.delete(challenge_record)
            db.commit()

            return True

        except Exception as e:
            logger.error(f"Passkey authentication verification failed: {e}")
            return False

    @staticmethod
    def list_passkeys(db: Session, user_id: str) -> List[Dict[str, Any]]:
        """List all passkeys for a user."""
        passkeys = db.query(UserPasskey).filter(
            UserPasskey.user_id == user_id
        ).order_by(UserPasskey.created_at.desc()).all()

        return [
            {
                "id": pk.id,
                "device_name": pk.device_name,
                "created_at": pk.created_at.isoformat(),
                "last_used_at": pk.last_used_at.isoformat() if pk.last_used_at else None,
            }
            for pk in passkeys
        ]

    @staticmethod
    def delete_passkey(db: Session, user_id: str, passkey_id: str) -> bool:
        """Delete a specific passkey."""
        result = db.query(UserPasskey).filter(
            UserPasskey.user_id == user_id,
            UserPasskey.id == passkey_id
        ).delete()
        db.commit()
        return result > 0

    @staticmethod
    def has_passkeys(db: Session, user_id: str) -> bool:
        """Check if user has any registered passkeys."""
        return db.query(UserPasskey).filter(
            UserPasskey.user_id == user_id
        ).first() is not None

    @staticmethod
    def get_passkey_count(db: Session, user_id: str) -> int:
        """Get the number of registered passkeys for a user."""
        return db.query(UserPasskey).filter(
            UserPasskey.user_id == user_id
        ).count()

    # ==========================================
    # Trusted Device Methods
    # ==========================================

    @staticmethod
    def create_trusted_device(
        db: Session,
        user_id: str,
        device_info: Optional[str],
        ip_address: Optional[str]
    ) -> str:
        """
        Create a new trusted device token.

        If the user has reached the maximum number of trusted devices,
        the oldest devices are automatically removed (FIFO).

        Returns:
            The plain device token to be stored in cookie
        """
        # Check device limit and remove oldest if necessary
        existing_devices = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user_id
        ).order_by(TrustedDevice.created_at.asc()).all()

        # Remove oldest devices if at or over limit (leave room for new one)
        while len(existing_devices) >= MAX_TRUSTED_DEVICES_PER_USER:
            oldest = existing_devices.pop(0)
            db.delete(oldest)

        # Generate a random token
        device_token = secrets.token_urlsafe(32)

        # Hash for storage
        token_hash = hashlib.sha256(device_token.encode()).hexdigest()

        # Create trusted device record
        trusted_device = TrustedDevice(
            user_id=user_id,
            device_token_hash=token_hash,
            device_name=device_info[:255] if device_info else None,
            ip_address=ip_address,
            trusted_until=TrustedDevice.calculate_expiry(),
        )
        db.add(trusted_device)
        db.commit()

        return device_token

    @staticmethod
    def verify_trusted_device(
        db: Session,
        user_id: str,
        device_token: str
    ) -> bool:
        """
        Verify if a device token is trusted.

        Returns:
            True if device is trusted and not expired, False otherwise
        """
        if not device_token:
            return False

        token_hash = hashlib.sha256(device_token.encode()).hexdigest()

        trusted_device = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user_id,
            TrustedDevice.device_token_hash == token_hash
        ).first()

        if not trusted_device:
            return False

        if not trusted_device.is_valid():
            # Device trust has expired, delete it
            db.delete(trusted_device)
            db.commit()
            return False

        # Update last used and extend trust
        trusted_device.extend_trust()
        db.commit()
        return True

    @staticmethod
    def list_trusted_devices(db: Session, user_id: str) -> List[Dict[str, Any]]:
        """List all trusted devices for a user."""
        devices = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user_id,
            TrustedDevice.trusted_until > datetime.utcnow()
        ).order_by(TrustedDevice.created_at.desc()).all()

        return [
            {
                "id": d.id,
                "device_name": d.device_name,
                "ip_address": d.ip_address,
                "trusted_until": d.trusted_until.isoformat(),
                "created_at": d.created_at.isoformat(),
                "last_used_at": d.last_used_at.isoformat() if d.last_used_at else None,
            }
            for d in devices
        ]

    @staticmethod
    def revoke_trusted_device(db: Session, user_id: str, device_id: str) -> bool:
        """Revoke trust for a specific device."""
        result = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user_id,
            TrustedDevice.id == device_id
        ).delete()
        db.commit()
        return result > 0

    @staticmethod
    def revoke_all_trusted_devices(db: Session, user_id: str) -> int:
        """Revoke all trusted devices for a user."""
        result = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user_id
        ).delete()
        db.commit()
        return result

    @staticmethod
    def cleanup_expired_devices(db: Session) -> int:
        """Remove all expired trusted devices. Called on startup."""
        result = db.query(TrustedDevice).filter(
            TrustedDevice.trusted_until < datetime.utcnow()
        ).delete()
        db.commit()
        return result

    # ==========================================
    # MFA Challenge Methods (for login flow)
    # ==========================================

    @staticmethod
    def create_login_challenge(db: Session, user_id: str) -> str:
        """
        Create an MFA challenge token for login flow.

        Returns:
            The MFA token to be returned to client
        """
        # Generate a random challenge
        challenge_data = secrets.token_bytes(32)

        # Delete any existing login challenges for this user
        db.query(MFAChallenge).filter(
            MFAChallenge.user_id == user_id,
            MFAChallenge.challenge_type == 'login'
        ).delete()

        # Create new challenge
        challenge = MFAChallenge(
            user_id=user_id,
            challenge_type='login',
            challenge_data=challenge_data,
            expires_at=MFAChallenge.calculate_expiry()
        )
        db.add(challenge)
        db.commit()

        # Return the challenge ID as the MFA token
        return challenge.id

    @staticmethod
    def verify_login_challenge(db: Session, mfa_token: str) -> Optional[str]:
        """
        Verify an MFA login challenge token.

        Returns:
            The user_id if valid, None otherwise
        """
        challenge = db.query(MFAChallenge).filter(
            MFAChallenge.id == mfa_token,
            MFAChallenge.challenge_type == 'login'
        ).first()

        if not challenge or not challenge.is_valid():
            return None

        return challenge.user_id

    @staticmethod
    def delete_login_challenge(db: Session, mfa_token: str) -> None:
        """Delete an MFA login challenge after successful verification.
        Uses SELECT FOR UPDATE to prevent a race condition where two concurrent
        requests could both verify the same challenge before either deletes it."""
        challenge = db.query(MFAChallenge).filter(
            MFAChallenge.id == mfa_token
        ).with_for_update().first()
        if not challenge:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired MFA token."
            )
        db.delete(challenge)
        db.commit()

    # ==========================================
    # Action Token Methods (for sensitive actions)
    # ==========================================

    @staticmethod
    def create_action_token(db: Session, user_id: str) -> str:
        """
        Create a short-lived action token for sensitive operations.

        Returns:
            The action token to be used in request header
        """
        # Generate a random challenge
        challenge_data = secrets.token_bytes(32)

        # Delete any existing action challenges for this user
        db.query(MFAChallenge).filter(
            MFAChallenge.user_id == user_id,
            MFAChallenge.challenge_type == 'action'
        ).delete()

        # Create new challenge
        challenge = MFAChallenge(
            user_id=user_id,
            challenge_type='action',
            challenge_data=challenge_data,
            expires_at=datetime.utcnow() + timedelta(minutes=ACTION_TOKEN_EXPIRY_MINUTES)
        )
        db.add(challenge)
        db.commit()

        return challenge.id

    @staticmethod
    def verify_action_token(db: Session, user_id: str, action_token: str) -> bool:
        """
        Verify an action token for sensitive operations.
        Token is single-use and deleted after verification.

        Returns:
            True if valid, False otherwise
        """
        challenge = db.query(MFAChallenge).filter(
            MFAChallenge.id == action_token,
            MFAChallenge.user_id == user_id,
            MFAChallenge.challenge_type == 'action'
        ).first()

        if not challenge or not challenge.is_valid():
            return False

        # Delete the token (single-use)
        db.delete(challenge)
        db.commit()
        return True

    # ==========================================
    # MFA Status Methods
    # ==========================================

    @staticmethod
    def get_mfa_status(db: Session, user: User) -> Dict[str, Any]:
        """Get comprehensive MFA status for a user."""
        passkey_count = MFAService.get_passkey_count(db, user.id)
        has_totp = MFAService.has_verified_totp(db, user.id)
        backup_codes_count = MFAService.get_remaining_backup_codes_count(db, user.id)
        trusted_devices_count = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == user.id,
            TrustedDevice.trusted_until > datetime.utcnow()
        ).count()

        return {
            "mfa_enabled": user.mfa_enabled,
            "preferred_method": user.mfa_preferred_method,
            "enabled_at": user.mfa_enabled_at.isoformat() if user.mfa_enabled_at else None,
            "has_passkeys": passkey_count > 0,
            "passkey_count": passkey_count,
            "has_totp": has_totp,
            "backup_codes_remaining": backup_codes_count,
            "trusted_devices_count": trusted_devices_count,
            "methods_available": []
        }

    @staticmethod
    def get_available_mfa_methods(db: Session, user_id: str) -> List[str]:
        """Get list of MFA methods available for a user."""
        methods = []

        if MFAService.has_passkeys(db, user_id):
            methods.append("passkey")

        if MFAService.has_verified_totp(db, user_id):
            methods.append("totp")

        if MFAService.get_remaining_backup_codes_count(db, user_id) > 0:
            methods.append("backup_code")

        return methods

    @staticmethod
    def enable_mfa(
        db: Session,
        user: User,
        preferred_method: str
    ) -> bool:
        """
        Enable MFA for a user.
        Requires at least one MFA method to be set up.
        """
        # Verify user has at least one method configured
        has_passkeys = MFAService.has_passkeys(db, user.id)
        has_totp = MFAService.has_verified_totp(db, user.id)

        if not has_passkeys and not has_totp:
            return False

        # Verify preferred method is available
        if preferred_method == "passkey" and not has_passkeys:
            return False
        if preferred_method == "totp" and not has_totp:
            return False

        user.mfa_enabled = True
        user.mfa_preferred_method = preferred_method
        user.mfa_enabled_at = datetime.utcnow()
        db.commit()
        return True

    @staticmethod
    def disable_mfa(db: Session, user: User) -> None:
        """
        Disable MFA for a user.
        Removes all MFA data (passkeys, TOTP, backup codes, trusted devices).
        """
        # Delete all MFA data
        db.query(UserPasskey).filter(UserPasskey.user_id == user.id).delete()
        db.query(UserTOTPSecret).filter(UserTOTPSecret.user_id == user.id).delete()
        db.query(UserBackupCode).filter(UserBackupCode.user_id == user.id).delete()
        db.query(TrustedDevice).filter(TrustedDevice.user_id == user.id).delete()
        db.query(MFAChallenge).filter(MFAChallenge.user_id == user.id).delete()

        # Update user
        user.mfa_enabled = False
        user.mfa_preferred_method = None
        user.mfa_enabled_at = None
        db.commit()

    @staticmethod
    def cleanup_expired_challenges(db: Session) -> int:
        """Remove all expired MFA challenges. Called on startup."""
        result = db.query(MFAChallenge).filter(
            MFAChallenge.expires_at < datetime.utcnow()
        ).delete()
        db.commit()
        return result
