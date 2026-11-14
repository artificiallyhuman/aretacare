"""Schemas for the admin-published in-app notice (see models/app_notice.py)."""
from datetime import datetime
from typing import List, Optional
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# A notice goes to every user, so a compromised admin account could use it for phishing.
# Its link may only point at AretaCare's own site; anything else belongs on a page there.
NOTICE_LINK_DOMAIN = "aretacare.com"


class AppNoticeCreate(BaseModel):
    title: str = Field(..., max_length=120)
    body: str = Field(..., max_length=2000)
    link_url: Optional[str] = Field(None, max_length=500)
    link_label: Optional[str] = Field(None, max_length=60)

    @field_validator("title", "body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("link_url", "link_label")
    @classmethod
    def _blank_is_none(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("link_url")
    @classmethod
    def _aretacare_https_only(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        parts = urlsplit(value)
        host = (parts.hostname or "").lower()
        if (
            parts.scheme != "https"
            or parts.username is not None
            or parts.password is not None
            or not (host == NOTICE_LINK_DOMAIN or host.endswith("." + NOTICE_LINK_DOMAIN))
        ):
            raise ValueError(f"must be an https:// link on {NOTICE_LINK_DOMAIN}")
        return value

    @model_validator(mode="after")
    def _label_needs_link(self):
        if self.link_url is None:
            self.link_label = None
        elif self.link_label is None:
            self.link_label = "Learn more"
        return self


class AppNoticeResponse(BaseModel):
    """What clients show. `id` changes with every publish, so it is the dismissal key."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    link_url: Optional[str] = None
    link_label: Optional[str] = None
    created_at: datetime


class CurrentAppNoticeResponse(BaseModel):
    notice: Optional[AppNoticeResponse] = None


class AdminAppNoticeResponse(AppNoticeResponse):
    is_active: bool
    created_by_email: str
    ended_at: Optional[datetime] = None
    ended_by_email: Optional[str] = None


class AdminAppNoticeListResponse(BaseModel):
    notices: List[AdminAppNoticeResponse]
