from pydantic import BaseModel, field_serializer
from datetime import datetime
from typing import Optional

from app.schemas.source_tag import SourceTagInfo


class AudioRecordingResponse(BaseModel):
    id: int
    session_id: str
    filename: str
    s3_key: str
    duration: Optional[float] = None
    transcribed_text: Optional[str] = None
    category: Optional[str] = None
    ai_summary: Optional[str] = None
    created_at: datetime
    # Source tracking for collaborative sessions
    created_by: Optional[SourceTagInfo] = None
    last_edited_by: Optional[SourceTagInfo] = None

    @field_serializer('category')
    def serialize_category(self, category, _info):
        """Convert enum to string value for backward compatibility"""
        if category is None:
            return None
        return category.value if hasattr(category, 'value') else str(category)

    class Config:
        from_attributes = True


class AudioRecordingUpdate(BaseModel):
    ai_summary: Optional[str] = None
    category: Optional[str] = None


class AudioRecordingListResponse(BaseModel):
    recordings: list[AudioRecordingResponse]
    has_more: bool = False
    total: int = 0
