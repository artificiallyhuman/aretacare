from pydantic import BaseModel, Field, EmailStr
from datetime import datetime
from typing import Optional, List


class SessionCreate(BaseModel):
    name: Optional[str] = None


class CollaboratorInfo(BaseModel):
    user_id: str
    email: str
    name: str
    added_at: datetime
    owned_session_count: int = 0  # Number of sessions this collaborator owns

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    last_activity: datetime
    is_active: bool
    owner_id: str
    owner_name: str = ""  # Name of the session owner
    owner_email: str = ""  # Email of the session owner
    is_owner: bool = False  # Will be set dynamically
    collaborators: List[CollaboratorInfo] = []

    class Config:
        from_attributes = True


class SessionRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=15, description="New session name")


class SessionShareRequest(BaseModel):
    email: EmailStr = Field(..., description="Email of the user to share the session with")


class SessionShareResponse(BaseModel):
    success: bool
    message: str
    collaborator: Optional[CollaboratorInfo] = None


class UserExistsResponse(BaseModel):
    exists: bool
    user_id: Optional[str] = None
    name: Optional[str] = None
    message: Optional[str] = None


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: str = Field(..., description="User ID of the collaborator to transfer ownership to")
