from pydantic import BaseModel
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
    created_at: datetime

    class Config:
        from_attributes = True


class AudioRecordingUpdate(BaseModel):
    description: Optional[str] = None


class AudioRecordingListResponse(BaseModel):
    recordings: list[AudioRecordingResponse]
