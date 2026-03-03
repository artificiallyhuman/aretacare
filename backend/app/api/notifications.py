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

    if existing:
        existing.user_id = current_user.id
        existing.last_used_at = datetime.utcnow()
        existing.app_version = request.app_version
        existing.platform = request.platform
    else:
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
