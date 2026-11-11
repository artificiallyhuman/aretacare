from datetime import datetime, timedelta
from typing import Optional, Tuple
import hashlib
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hour (short-lived)
REFRESH_TOKEN_EXPIRE_DAYS = 7  # 7 days (healthcare-appropriate)


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


def create_user_access_token(user) -> str:
    """Access token for a user, stamped with their current token version."""
    return create_access_token(data={"sub": user.id, "tv": user.token_version or 0})


def access_token_is_current(payload: dict, user) -> bool:
    """False when the token predates the user's last "revoke everything".

    Tokens issued before the claim existed carry no version and count as version 0.
    """
    return int(payload.get("tv") or 0) == int(user.token_version or 0)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def find_refresh_token(db, raw_token: str, for_update: bool = False):
    """Look up a refresh token row by the raw value a client presented.

    Matches on the hash. Also matches a row holding the raw value with no hash yet:
    those are written by instances still on the previous release during a rolling
    deploy, until the startup backfill fills in their hash.
    """
    from app.models.refresh_token import RefreshToken
    from sqlalchemy import and_, or_

    query = db.query(RefreshToken).filter(
        or_(
            RefreshToken.token_hash == hash_refresh_token(raw_token),
            and_(RefreshToken.token_hash.is_(None), RefreshToken.token == raw_token),
        )
    )
    if for_update:
        query = query.with_for_update()
    return query.first()


def decode_access_token(token: str) -> Optional[dict]:
    """Decode a JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# Maximum active refresh tokens per user (oldest are revoked when limit exceeded)
MAX_ACTIVE_TOKENS_PER_USER = 5


def create_refresh_token_record(db, user_id: str, device_info: str = None, ip_address: str = None):
    """
    Create a refresh token record in the database.

    Returns the raw token string for the client. The database keeps its SHA-256
    hash (see RefreshToken.token_hash), which is what lookups use.

    Enforces a maximum of MAX_ACTIVE_TOKENS_PER_USER active tokens per user.
    When the limit is exceeded, the oldest tokens are automatically revoked.
    """
    from app.models.refresh_token import RefreshToken

    # Generate a secure random token (43 chars, 256 bits of entropy)
    token = RefreshToken.generate_token()

    # Create the database record
    now = datetime.utcnow()
    token_hash = hash_refresh_token(token)
    refresh_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        token=token if settings.REFRESH_TOKEN_STORE_RAW else token_hash,
        expires_at=now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        device_info=device_info,
        ip_address=ip_address,
        last_used_at=now  # Set on creation so device appears in "active in last 24h" immediately
    )

    db.add(refresh_token)
    db.commit()
    db.refresh(refresh_token)

    # Enforce token limit: revoke oldest tokens if over the limit
    _enforce_token_limit(db, user_id)

    return token, refresh_token


def _enforce_token_limit(db, user_id: str):
    """
    Enforce the maximum active tokens limit for a user.
    Revokes the oldest tokens (by last_used_at, then created_at) if over the limit.
    """
    from app.models.refresh_token import RefreshToken
    from sqlalchemy import func, case

    now = datetime.utcnow()

    # Get all active tokens for this user, ordered by last activity (oldest first)
    # Use last_used_at if available, otherwise fall back to created_at
    active_tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.is_revoked == False,
        RefreshToken.expires_at > now
    ).order_by(
        # Sort by last_used_at (nulls last), then by created_at
        case((RefreshToken.last_used_at.is_(None), 1), else_=0),
        RefreshToken.last_used_at.asc(),
        RefreshToken.created_at.asc()
    ).all()

    # If over the limit, revoke the oldest tokens
    tokens_to_revoke = len(active_tokens) - MAX_ACTIVE_TOKENS_PER_USER
    if tokens_to_revoke > 0:
        for token in active_tokens[:tokens_to_revoke]:
            token.is_revoked = True
            token.revoked_at = now
        db.commit()


def verify_refresh_token(db, raw_token: str, for_rotation: bool = False):
    """
    Verify a refresh token and return the associated record if valid.

    Returns the RefreshToken record if valid, None otherwise.
    Uses indexed database lookup (O(1)) instead of iterating all tokens.

    Args:
        db: Database session
        raw_token: The refresh token string to verify
        for_rotation: If True, uses SELECT FOR UPDATE to lock the row,
                      preventing race conditions when multiple requests
                      try to rotate the same token simultaneously
    """
    token_record = find_refresh_token(db, raw_token, for_update=for_rotation)

    if token_record and token_record.is_valid():
        # Update last_used_at
        token_record.last_used_at = datetime.utcnow()
        db.commit()
        return token_record

    if for_rotation:
        db.rollback()  # release the row lock
    return None


def claim_refresh_token_for_rotation(db, raw_token: str) -> Tuple[Optional[object], str]:
    """Exchange a refresh token: mark it used and report whether a new one may be issued.

    Returns (record, outcome):
      "rotated"  the token was live and is now revoked; issue a replacement.
      "grace"    the token was rotated moments ago; issue another replacement. This is
                 the retry of a rotation whose response was lost, or a second tab that
                 raced the first.
      "reuse"    the token was rotated longer ago than the grace window. A legitimate
                 client replaces its token on every refresh, so this is either a stale
                 copy or a stolen one. No replacement.
      "invalid"  unknown, expired, or revoked by logout. No replacement.

    The row is locked for the duration, and the revoke is a conditional UPDATE, so two
    concurrent requests cannot both come away with "rotated".
    """
    from app.models.refresh_token import RefreshToken

    now = datetime.utcnow()
    record = find_refresh_token(db, raw_token, for_update=True)

    if record is None or record.expires_at <= now:
        db.rollback()
        return None, "invalid"

    if not record.is_revoked:
        claimed = db.query(RefreshToken).filter(
            RefreshToken.id == record.id,
            RefreshToken.is_revoked == False,
        ).update(
            {
                RefreshToken.is_revoked: True,
                RefreshToken.revoked_at: now,
                RefreshToken.replaced_at: now,
                RefreshToken.last_used_at: now,
            },
            synchronize_session=False,
        )
        db.commit()
        if claimed == 1:
            return record, "rotated"
        db.refresh(record)
    else:
        db.rollback()

    if record.replaced_at is None:
        return None, "invalid"

    age = (now - record.replaced_at).total_seconds()
    if age <= settings.REFRESH_TOKEN_ROTATION_GRACE_SECONDS:
        return record, "grace"
    return record, "reuse"


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

    # Signing out everywhere also has to stop push notifications: a device that can no
    # longer refresh its session must not keep receiving lock-screen alerts about the
    # account. A device that signs back in registers its token again.
    from app.models.device_token import DeviceToken
    db.query(DeviceToken).filter(DeviceToken.user_id == user_id).delete(synchronize_session=False)

    # Invalidate access tokens already issued (see User.token_version). Done as an
    # in-database increment so concurrent revocations cannot lose one.
    from app.models.user import User
    db.query(User).filter(User.id == user_id).update(
        {User.token_version: User.token_version + 1}, synchronize_session=False
    )

    db.commit()
    return len(tokens)
