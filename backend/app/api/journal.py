from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Session as SessionModel
from app.schemas.journal import (
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalEntryResponse,
    JournalEntriesGrouped
)
from app.services.journal_service import JournalService
from app.api.auth import get_current_user
from datetime import date
from typing import Optional

router = APIRouter(prefix="/journal", tags=["journal"])


@router.get("/{session_id}", response_model=JournalEntriesGrouped)
async def get_journal_entries(
    session_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all journal entries for a session, grouped by date"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Parse dates
    start = date.fromisoformat(start_date) if start_date else None
    end = date.fromisoformat(end_date) if end_date else None

    # Get entries
    journal_service = JournalService(db)
    entries_by_date = await journal_service.get_entries_by_date(
        session_id=session_id,
        start_date=start,
        end_date=end
    )

    return {"entries_by_date": entries_by_date}


@router.get("/{session_id}/date/{target_date}")
async def get_entries_for_date(
    session_id: str,
    target_date: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all journal entries for a specific date"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Parse date
    try:
        parsed_date = date.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format (use YYYY-MM-DD)")

    # Get entries
    journal_service = JournalService(db)
    entries = await journal_service.get_entries_for_date(
        session_id=session_id,
        target_date=parsed_date
    )

    return entries


@router.post("/{session_id}", response_model=JournalEntryResponse)
async def create_journal_entry(
    session_id: str,
    entry_data: JournalEntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """User creates a manual journal entry"""
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Create entry
    journal_service = JournalService(db)
    entry = await journal_service.create_entry(
        session_id=session_id,
        entry_data=entry_data,
        created_by=current_user.id
    )

    return entry


@router.put("/{entry_id}", response_model=JournalEntryResponse)
async def update_journal_entry(
    entry_id: int,
    updates: JournalEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """User edits an existing journal entry"""
    journal_service = JournalService(db)
    entry = await journal_service.update_entry(
        entry_id=entry_id,
        updates=updates,
        user_id=current_user.id
    )

    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found or access denied")

    return entry


@router.delete("/{entry_id}")
async def delete_journal_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """User deletes a journal entry"""
    journal_service = JournalService(db)
    success = await journal_service.delete_entry(
        entry_id=entry_id,
        user_id=current_user.id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Journal entry not found or access denied")

    return {"message": "Journal entry deleted successfully"}
