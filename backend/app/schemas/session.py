from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SessionCreate(BaseModel):
    pass


class SessionResponse(BaseModel):
    id: str
    created_at: datetime
    last_activity: datetime
    is_active: bool

    class Config:
        from_attributes = True
