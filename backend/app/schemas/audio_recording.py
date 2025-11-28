from pydantic import BaseModel, field_serializer
from datetime import datetime
from typing import Optional


class AudioRecordingResponse(BaseModel):
    id: int
    session_id: str
    filename: str
    s3_key: str
    duration: Optional[float] = None
    transcribed_text: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    ai_summary: Optional[str] = None
    created_at: datetime

    @field_serializer('category')
    def serialize_category(self, category, _info):
        """Convert enum to string value for backward compatibility"""
        if category is None:
            return None
        return category.value if hasattr(category, 'value') else str(category)

    class Config:
        from_attributes = True


class AudioRecordingUpdate(BaseModel):
    description: Optional[str] = None


class AudioRecordingListResponse(BaseModel):
    recordings: list[AudioRecordingResponse]
