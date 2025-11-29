from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class SessionCreate(BaseModel):
    name: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    last_activity: datetime
    is_active: bool

    class Config:
        from_attributes = True


class SessionRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=15, description="New session name")
