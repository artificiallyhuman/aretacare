"""Email addresses are matched without regard to case.

Every request schema that takes an email uses `NormalizedEmail` (trimmed and lowercased),
so new accounts, invitations and security-log rows are stored lowercase, and a failed-login
lockout can't be sidestepped by changing the case of the address. Accounts created before
this may still hold mixed case (the web client sent the address as typed, and `EmailStr`
lowercases only the domain), so user lookups compare `lower(users.email)`, which the
`idx_users_email_lower` index serves. Look users up with `find_user_by_email`, never with
`User.email == ...`.
"""
import logging
from typing import Annotated

from pydantic import AfterValidator, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def normalize_email(value: str) -> str:
    return value.strip().lower()


NormalizedEmail = Annotated[EmailStr, AfterValidator(normalize_email)]


def find_user_by_email(db: Session, email: str, *criteria):
    """The user with this address in any case, or None. Extra filter criteria are ANDed in.

    Accounts that differ only by case can exist from before normalization (the unique
    index on `users.email` is case-sensitive). Then the lowercase one wins, else the
    oldest, so the result is stable; the warning makes such pairs visible in the logs.
    """
    from app.models.user import User

    normalized = normalize_email(email)
    matches = db.query(User).filter(func.lower(User.email) == normalized, *criteria).all()
    if len(matches) <= 1:
        return matches[0] if matches else None
    logger.warning(
        "%d accounts share an email address that differs only by case (user ids: %s)",
        len(matches), ", ".join(str(u.id) for u in matches),
    )
    for user in matches:
        if user.email == normalized:
            return user
    return min(matches, key=lambda u: u.created_at)
