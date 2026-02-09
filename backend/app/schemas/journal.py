from pydantic import BaseModel, Field
from datetime import datetime, date
from app.models.journal import EntryType
from typing import Optional, List, Dict

from app.schemas.source_tag import SourceTagInfo


class JournalEntryCreate(BaseModel):
    title: str = Field(..., max_length=100)
    content: str
    entry_type: EntryType
    entry_date: Optional[date] = None  # Defaults to today if not provided


class JournalEntryUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=100)
    content: Optional[str] = None
    entry_type: Optional[EntryType] = None
    entry_date: Optional[date] = None


class JournalEntryResponse(BaseModel):
    id: int
    session_id: str
    entry_date: date
    entry_type: EntryType
    title: str
    content: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    source_message_ids: Optional[List[int]] = None
    entry_metadata: Optional[Dict] = None
    # Source tracking for collaborative sessions
    created_by_info: Optional[SourceTagInfo] = None  # Populated for non-AI entries
    last_edited_by: Optional[SourceTagInfo] = None

    class Config:
        from_attributes = True
        # Ignore extra attributes from SQLAlchemy model (like metadata)
        extra = "ignore"


class JournalEntriesGrouped(BaseModel):
    entries_by_date: Dict[str, List[JournalEntryResponse]]
    total_dates: Optional[int] = None
    has_more: Optional[bool] = None
    oldest_date: Optional[str] = None


class JournalSuggestion(BaseModel):
    title: str
    content: str
    entry_type: EntryType
    confidence: float
    entry_date: Optional[date] = None  # Date for the entry (defaults to today if not specified)


class JournalSynthesisResult(BaseModel):
    should_create: bool
    reasoning: str
    suggested_entries: List[JournalSuggestion]
    warning: Optional[str] = None  # User-facing warning about processing limits
