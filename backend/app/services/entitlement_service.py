"""Server-side check of the iOS subscription (RevenueCat).

The iOS app gates itself on the RevenueCat entitlement, but that check lives on the
device: nothing stops a free web account from calling an iOS-only endpoint directly.
Features that cost real money per use (Talk mode) verify the entitlement here.

The app logs in to RevenueCat with the backend user id, so the app user id is `user.id`.
"""
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Optional
from urllib.parse import quote

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

REVENUECAT_SUBSCRIBER_URL = "https://api.revenuecat.com/v1/subscribers/{app_user_id}"

# Only positive answers are cached: someone who has just subscribed must not be told
# "no" for five minutes, while a lapsed subscriber keeping access that long is harmless.
_CACHE_TTL_SECONDS = 300
_CACHE_MAX_ENTRIES = 5000
_active_until: Dict[str, float] = {}


class EntitlementCheckUnavailable(Exception):
    """RevenueCat could not be reached or answered unexpectedly. Callers fail closed."""


def _parse_expiry(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def entitlement_is_active(subscriber: dict, entitlement_id: str) -> bool:
    """Whether a RevenueCat subscriber payload carries the entitlement, unexpired.

    `expires_date` is null for lifetime access; a grace period extends access past it.
    """
    entitlement = (subscriber.get("entitlements") or {}).get(entitlement_id)
    if not isinstance(entitlement, dict):
        return False
    if "expires_date" in entitlement and entitlement["expires_date"] is None:
        return True
    now = datetime.now(timezone.utc)
    for key in ("expires_date", "grace_period_expires_date"):
        expiry = _parse_expiry(entitlement.get(key))
        if expiry is not None and expiry > now:
            return True
    return False


async def has_active_subscription(user_id: str) -> bool:
    """True when the user holds the iOS subscription entitlement.

    Raises EntitlementCheckUnavailable when that cannot be determined.
    """
    if not settings.REVENUECAT_SECRET_API_KEY:
        if settings.DEBUG:
            # Local development and the simulator (which the app also treats as
            # subscribed). Startup validation refuses this combination outside DEBUG.
            return True
        raise EntitlementCheckUnavailable("REVENUECAT_SECRET_API_KEY is not configured")

    now = time.monotonic()
    cached = _active_until.get(user_id)
    if cached is not None and cached > now:
        return True

    url = REVENUECAT_SUBSCRIBER_URL.format(app_user_id=quote(user_id, safe=""))
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {settings.REVENUECAT_SECRET_API_KEY}",
                    "Accept": "application/json",
                },
            )
    except httpx.HTTPError as e:
        raise EntitlementCheckUnavailable(f"RevenueCat request failed: {type(e).__name__}") from e

    if response.status_code != 200:
        raise EntitlementCheckUnavailable(f"RevenueCat returned HTTP {response.status_code}")
    try:
        subscriber = response.json().get("subscriber") or {}
    except ValueError as e:
        raise EntitlementCheckUnavailable("RevenueCat returned a non-JSON body") from e

    active = entitlement_is_active(subscriber, settings.REVENUECAT_ENTITLEMENT_ID)
    if active:
        if len(_active_until) >= _CACHE_MAX_ENTRIES:
            _active_until.clear()
        _active_until[user_id] = now + _CACHE_TTL_SECONDS
    else:
        _active_until.pop(user_id, None)
    return active
