from fastapi import APIRouter, Depends, HTTPException, Query
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
from app.api.permissions import check_session_access
from app.api.source_tags import session_has_collaborators, build_source_tag_info, get_user_map
from datetime import date
from typing import Optional

router = APIRouter(prefix="/journal", tags=["journal"])


@router.get("/{session_id}", response_model=JournalEntriesGrouped)
async def get_journal_entries(
    session_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    max_dates: int = Query(90, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get journal entries for a session, grouped by date with pagination.

    Returns the most recent `max_dates` date groups (default 90).
    Use `end_date` set to the day before `oldest_date` from a previous
    response to load older pages.
    """
    # Verify session belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    # Parse dates
    start = date.fromisoformat(start_date) if start_date else None
    end = date.fromisoformat(end_date) if end_date else None

    # Get entries with pagination
    journal_service = JournalService(db)
    result = await journal_service.get_entries_by_date(
        session_id=session_id,
        start_date=start,
        end_date=end,
        max_dates=max_dates
    )

    entries_by_date = result["entries_by_date"]
    pagination = {
        "total_dates": result["total_dates"],
        "has_more": result["has_more"],
        "oldest_date": result["oldest_date"],
    }

    # Check if session has collaborators (for source tag attribution)
    has_collaborators = session_has_collaborators(session_id, db)

    if has_collaborators:
        # Collect all user IDs for batch loading
        user_ids = []
        for date_entries in entries_by_date.values():
            for entry in date_entries:
                # created_by is 'ai' or user_id
                if entry.created_by and entry.created_by != 'ai':
                    user_ids.append(entry.created_by)
                if entry.last_edited_by_user_id:
                    user_ids.append(entry.last_edited_by_user_id)

        user_map = get_user_map(user_ids, db)

        # Build enriched response with source tags
        enriched_entries_by_date = {}
        for date_str, entries in entries_by_date.items():
            enriched_entries = []
            for entry in entries:
                entry_dict = {
                    "id": entry.id,
                    "session_id": entry.session_id,
                    "entry_date": entry.entry_date,
                    "entry_type": entry.entry_type,
                    "title": entry.title,
                    "content": entry.content,
                    "created_by": entry.created_by,
                    "created_at": entry.created_at,
                    "updated_at": entry.updated_at,
                    "source_message_ids": entry.source_message_ids,
                    "entry_metadata": entry.entry_metadata,
                    # Source tags
                    "created_by_info": build_source_tag_info(user_map.get(entry.created_by)) if entry.created_by and entry.created_by != 'ai' else None,
                    "last_edited_by": build_source_tag_info(user_map.get(entry.last_edited_by_user_id)) if entry.last_edited_by_user_id else None
                }
                enriched_entries.append(entry_dict)
            enriched_entries_by_date[date_str] = enriched_entries

        return {"entries_by_date": enriched_entries_by_date, **pagination}

    return {"entries_by_date": entries_by_date, **pagination}


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
    check_session_access(session, current_user.id, db)

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

    # Check if session has collaborators (for source tag attribution)
    has_collaborators = session_has_collaborators(session_id, db)

    if has_collaborators and entries:
        # Collect user IDs for batch loading
        user_ids = []
        for entry in entries:
            if entry.created_by and entry.created_by != 'ai':
                user_ids.append(entry.created_by)
            if entry.last_edited_by_user_id:
                user_ids.append(entry.last_edited_by_user_id)

        user_map = get_user_map(user_ids, db)

        # Build enriched response
        enriched_entries = []
        for entry in entries:
            entry_dict = {
                "id": entry.id,
                "session_id": entry.session_id,
                "entry_date": entry.entry_date,
                "entry_type": entry.entry_type,
                "title": entry.title,
                "content": entry.content,
                "created_by": entry.created_by,
                "created_at": entry.created_at,
                "updated_at": entry.updated_at,
                "source_message_ids": entry.source_message_ids,
                "entry_metadata": entry.entry_metadata,
                "created_by_info": build_source_tag_info(user_map.get(entry.created_by)) if entry.created_by and entry.created_by != 'ai' else None,
                "last_edited_by": build_source_tag_info(user_map.get(entry.last_edited_by_user_id)) if entry.last_edited_by_user_id else None
            }
            enriched_entries.append(entry_dict)
        return enriched_entries

    return entries


@router.get("/{session_id}/dates")
async def get_journal_dates(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all distinct dates that have journal entries, with entry counts.

    Returns a lightweight list for the calendar/date picker view.
    """
    from app.models.journal import JournalEntry
    from sqlalchemy import func, desc

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    rows = (
        db.query(
            JournalEntry.entry_date,
            func.count(JournalEntry.id).label("entry_count")
        )
        .filter(JournalEntry.session_id == session_id)
        .group_by(JournalEntry.entry_date)
        .order_by(desc(JournalEntry.entry_date))
        .all()
    )

    return {
        "dates": [
            {"date": row.entry_date.isoformat(), "entry_count": row.entry_count}
            for row in rows
        ]
    }


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
    check_session_access(session, current_user.id, db)

    # Create entry
    journal_service = JournalService(db)
    entry = await journal_service.create_entry(
        session_id=session_id,
        entry_data=entry_data,
        created_by=current_user.id
    )

    # Return with source tag if session has collaborators
    has_collaborators = session_has_collaborators(session_id, db)
    if has_collaborators:
        return {
            "id": entry.id,
            "session_id": entry.session_id,
            "entry_date": entry.entry_date,
            "entry_type": entry.entry_type,
            "title": entry.title,
            "content": entry.content,
            "created_by": entry.created_by,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
            "source_message_ids": entry.source_message_ids,
            "entry_metadata": entry.entry_metadata,
            "created_by_info": build_source_tag_info(current_user),
            "last_edited_by": None
        }

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

    # Return with source tags if session has collaborators
    has_collaborators = session_has_collaborators(entry.session_id, db)
    if has_collaborators:
        # Get creator info if not AI
        creator_info = None
        if entry.created_by and entry.created_by != 'ai':
            user_map = get_user_map([entry.created_by], db)
            creator_info = build_source_tag_info(user_map.get(entry.created_by))

        return {
            "id": entry.id,
            "session_id": entry.session_id,
            "entry_date": entry.entry_date,
            "entry_type": entry.entry_type,
            "title": entry.title,
            "content": entry.content,
            "created_by": entry.created_by,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
            "source_message_ids": entry.source_message_ids,
            "entry_metadata": entry.entry_metadata,
            "created_by_info": creator_info,
            "last_edited_by": build_source_tag_info(current_user)
        }

    return {
        "id": entry.id,
        "session_id": entry.session_id,
        "entry_date": entry.entry_date,
        "entry_type": entry.entry_type,
        "title": entry.title,
        "content": entry.content,
        "created_by": entry.created_by,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "source_message_ids": entry.source_message_ids,
        "entry_metadata": entry.entry_metadata,
        "created_by_info": None,
        "last_edited_by": None
    }


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
