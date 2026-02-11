from pydantic import BaseModel
from typing import Optional


class DeviceTokenRequest(BaseModel):
    token: str
    platform: str = "ios"
    app_version: Optional[str] = None
