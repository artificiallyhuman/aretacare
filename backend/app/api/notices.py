"""The current in-app notice, for any signed-in user (admins publish it in admin.py)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models import AppNotice, User
from app.schemas.notice import CurrentAppNoticeResponse

router = APIRouter(tags=["notices"])


@router.get("/notice", response_model=CurrentAppNoticeResponse)
async def get_current_notice(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """The active notice, or `{"notice": null}`. Deliberately not gated on AI consent or the
    iOS subscription: a breach notice has to reach every account holder."""
    notice = (
        db.query(AppNotice)
        .filter(AppNotice.is_active.is_(True))
        .order_by(AppNotice.id.desc())
        .first()
    )
    return CurrentAppNoticeResponse(notice=notice)
