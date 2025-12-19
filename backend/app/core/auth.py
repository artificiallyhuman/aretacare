from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hour (short-lived)
REFRESH_TOKEN_EXPIRE_DAYS = 30  # 30 days (long-lived)


def _truncate_password(password: str, max_bytes: int = 72) -> str:
    """Truncate password to max_bytes while respecting UTF-8 character boundaries."""
    password_bytes = password.encode('utf-8')
    if len(password_bytes) <= max_bytes:
        return password

    # Truncate and handle potential partial UTF-8 characters
    truncated = password_bytes[:max_bytes]
    # Try to decode, if it fails, keep removing bytes until it works
    while truncated:
        try:
            return truncated.decode('utf-8')
        except UnicodeDecodeError:
            truncated = truncated[:-1]
    return ""


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    # Bcrypt has a 72-byte limit, truncate if necessary to match hashing behavior
    truncated = _truncate_password(plain_password)
    return pwd_context.verify(truncated, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    # Bcrypt has a 72-byte limit, truncate if necessary
    truncated = _truncate_password(password)
    return pwd_context.hash(truncated)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode a JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def create_refresh_token_record(db, user_id: str, device_info: str = None, ip_address: str = None):
    """
    Create a refresh token record in the database.

    Returns the token string which is stored directly (not hashed).
    Refresh tokens are already cryptographically secure random values,
    so hashing provides no additional security benefit while causing
    significant performance issues (would require checking all tokens).
    """
    from app.models.refresh_token import RefreshToken

    # Generate a secure random token (43 chars, 256 bits of entropy)
    token = RefreshToken.generate_token()

    # Create the database record
    refresh_token = RefreshToken(
        user_id=user_id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        device_info=device_info,
        ip_address=ip_address
    )

    db.add(refresh_token)
    db.commit()
    db.refresh(refresh_token)

    return token, refresh_token


def verify_refresh_token(db, raw_token: str):
    """
    Verify a refresh token and return the associated record if valid.

    Returns the RefreshToken record if valid, None otherwise.
    Uses indexed database lookup (O(1)) instead of iterating all tokens.
    """
    from app.models.refresh_token import RefreshToken

    # Direct database lookup using indexed token column
    token_record = db.query(RefreshToken).filter(
        RefreshToken.token == raw_token,
        RefreshToken.is_revoked == False,
        RefreshToken.expires_at > datetime.utcnow()
    ).first()

    if token_record:
        # Update last_used_at
        token_record.last_used_at = datetime.utcnow()
        db.commit()
        return token_record

    return None


def revoke_refresh_token(db, token_id: int):
    """Revoke a specific refresh token."""
    from app.models.refresh_token import RefreshToken

    token = db.query(RefreshToken).filter(RefreshToken.id == token_id).first()
    if token:
        token.is_revoked = True
        token.revoked_at = datetime.utcnow()
        db.commit()
        return True
    return False


def revoke_all_user_tokens(db, user_id: str):
    """Revoke all refresh tokens for a user (logout everywhere)."""
    from app.models.refresh_token import RefreshToken

    now = datetime.utcnow()

    # Only count active tokens (not revoked AND not expired)
    tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.is_revoked == False,
        RefreshToken.expires_at > now
    ).all()

    for token in tokens:
        token.is_revoked = True
        token.revoked_at = now

    db.commit()
    return len(tokens)
