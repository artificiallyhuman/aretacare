from pydantic import BaseModel, Field, EmailStr, field_validator
from datetime import datetime
from typing import Optional, List
import re

# Regex pattern for safe session names: alphanumeric, spaces, hyphens, underscores, apostrophes
SESSION_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9\s\-_']+$")


class SessionCreate(BaseModel):
    name: Optional[str] = Field(None, max_length=15)

    @field_validator('name')
    @classmethod
    def validate_session_name(cls, v):
        if v is not None:
            v = v.strip()
            if len(v) == 0:
                return None
            if not SESSION_NAME_PATTERN.match(v):
                raise ValueError('Session name can only contain letters, numbers, spaces, hyphens, underscores, and apostrophes')
        return v


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

    @field_validator('name')
    @classmethod
    def validate_session_name(cls, v):
        v = v.strip()
        if len(v) == 0:
            raise ValueError('Session name cannot be empty')
        if not SESSION_NAME_PATTERN.match(v):
            raise ValueError('Session name can only contain letters, numbers, spaces, hyphens, underscores, and apostrophes')
        return v


class UserCheckRequest(BaseModel):
    """Request to check if a user exists (before sharing)"""
    email: EmailStr = Field(..., description="Email to check")


class SessionShareRequest(BaseModel):
    email: EmailStr = Field(..., description="Email of the user to share the session with")
    confirm_sharing_consent: bool = Field(..., description="User confirms they have the right to share this session")


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
