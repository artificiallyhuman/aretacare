"""
MFA (Multi-Factor Authentication) Configuration

This module contains all configuration constants for MFA functionality.
"""
import os

# ==========================================
# TOTP Configuration
# ==========================================

# Issuer name shown in authenticator apps
TOTP_ISSUER = "AretaCare"

# Number of digits in TOTP codes (standard is 6)
TOTP_DIGITS = 6

# Time period in seconds for TOTP codes (standard is 30)
TOTP_INTERVAL = 30

# Number of time periods to allow for clock drift
# 1 means we accept codes from -30s to +30s of current time
TOTP_WINDOW = 1

# ==========================================
# Backup Codes Configuration
# ==========================================

# Number of backup codes to generate
BACKUP_CODE_COUNT = 10

# Length of each backup code (in characters)
BACKUP_CODE_LENGTH = 8

# ==========================================
# Trusted Devices Configuration
# ==========================================

# How long a device remains trusted (in days)
TRUSTED_DEVICE_DURATION_DAYS = 30

# Maximum number of trusted devices per user
# When exceeded, oldest devices are automatically removed (FIFO)
MAX_TRUSTED_DEVICES_PER_USER = 10

# Cookie name for trusted device token
TRUSTED_DEVICE_COOKIE_NAME = "trusted_device"

# ==========================================
# MFA Challenge Configuration
# ==========================================

# How long MFA challenges remain valid (in minutes)
CHALLENGE_EXPIRY_MINUTES = 5

# How long action tokens for sensitive operations remain valid (in minutes)
ACTION_TOKEN_EXPIRY_MINUTES = 5

# ==========================================
# WebAuthn (Passkey) Configuration
# ==========================================

# Maximum number of passkeys a user can register
MAX_PASSKEYS_PER_USER = 10

# Relying Party ID - should match your domain
# In development, this is typically "localhost"
# In production, this should be your domain (e.g., "aretacare.com")
RP_ID = os.getenv("WEBAUTHN_RP_ID", "localhost")

# Relying Party Name - displayed to users during registration
RP_NAME = "AretaCare"

# Expected origin for WebAuthn requests
# In development: "http://localhost:3001"
# In production: "https://aretacare.com" (or your actual domain)
WEBAUTHN_ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "http://localhost:3001")

# User verification requirement
# "preferred" - verify if available (fingerprint, face, etc.)
# "required" - always require user verification
# "discouraged" - don't require user verification
USER_VERIFICATION = "preferred"

# Attestation preference
# "none" - no attestation required (recommended for most use cases)
# "indirect" - allow indirect attestation
# "direct" - require direct attestation
ATTESTATION = "none"

# ==========================================
# Rate Limiting
# ==========================================

# Maximum MFA verification attempts per minute
MFA_VERIFY_RATE_LIMIT = "5/minute"

# Maximum MFA setup attempts per hour
MFA_SETUP_RATE_LIMIT = "10/hour"

# Maximum backup code generation attempts per hour
MFA_BACKUP_CODES_RATE_LIMIT = "3/hour"

# ==========================================
# Security
# ==========================================

# Encryption key for TOTP secrets (derived from SECRET_KEY)
# The actual key derivation happens in mfa_service.py


def get_mfa_encryption_key() -> bytes:
    """
    Derive an encryption key for TOTP secrets from the application's SECRET_KEY.
    Uses PBKDF2 with SHA256 to derive a 32-byte key.
    """
    from app.core.config import settings
    import hashlib

    # Use PBKDF2 to derive a key from SECRET_KEY
    # Salt is fixed but unique to this purpose
    salt = b"aretacare_mfa_totp_encryption_v1"
    key = hashlib.pbkdf2_hmac(
        'sha256',
        settings.SECRET_KEY.encode(),
        salt,
        iterations=100000,
        dklen=32
    )
    return key
