from pydantic import BaseModel, Field
from datetime import datetime, date
from app.models.journal import EntryType
from typing import Optional, List, Dict


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

    class Config:
        from_attributes = True
        # Ignore extra attributes from SQLAlchemy model (like metadata)
        extra = "ignore"


class JournalEntriesGrouped(BaseModel):
    entries_by_date: Dict[str, List[JournalEntryResponse]]


class JournalSuggestion(BaseModel):
    title: str
    content: str
    entry_type: EntryType
    confidence: float


class JournalSynthesisResult(BaseModel):
    should_create: bool
    reasoning: str
    suggested_entries: List[JournalSuggestion]
