from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import uuid
import logging

from app.core.database import get_db
from app.models.user import User
from app.models.device_token import DeviceToken
from app.api.auth import get_current_user
from app.schemas.notification import DeviceTokenRequest
from app.services.security_service import security_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/device-token")
async def register_device_token(
    request: DeviceTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register or update an APNs device token for push notifications."""
    existing = db.query(DeviceToken).filter(DeviceToken.token == request.token).first()

    if existing and existing.user_id == current_user.id:
        # Same user re-registering the same device — just refresh the metadata.
        existing.last_used_at = datetime.utcnow()
        existing.app_version = request.app_version
        existing.platform = request.platform
    else:
        if existing:
            # The token is on file against a different account. That is legitimate when a
            # device changes hands (APNs reissues tokens per install), but silently
            # re-pointing the row would let anyone who learns a token redirect that
            # device's notifications to themselves — delivering their care-session names
            # to the previous owner's lock screen. Drop the stale row and log the handover
            # rather than mutating it in place.
            logger.info(
                "Device token reassigned from user %s to user %s",
                existing.user_id,
                current_user.id,
            )
            try:
                security_service.log_event(
                    db=db,
                    event_type="device_token_reassigned",
                    email=current_user.email,
                    user_id=current_user.id,
                    endpoint="/api/notifications/device-token",
                    details=f"Device token moved from user {existing.user_id}",
                )
            except Exception as e:  # pragma: no cover - logging must not block registration
                logger.warning(f"Failed to log device token reassignment: {e}")
            db.delete(existing)
            db.flush()

        db.add(DeviceToken(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            token=request.token,
            platform=request.platform,
            app_version=request.app_version,
        ))

    db.commit()
    return {"status": "registered"}


@router.delete("/device-token")
async def unregister_device_token(
    request: DeviceTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a device token on logout."""
    db.query(DeviceToken).filter(
        DeviceToken.token == request.token,
        DeviceToken.user_id == current_user.id,
    ).delete()
    db.commit()
    return {"status": "unregistered"}
