from pydantic import BaseModel
from typing import Optional


class SourceTagInfo(BaseModel):
    """Information about who created/edited an item for source attribution display."""
    user_id: str
    name: str
    initials: str


def get_initials(full_name: str) -> str:
    """
    Generate initials from a full name.

    Examples:
        'Rob Whiteman' -> 'RW'
        'Jane Doe Smith' -> 'JS'
        'Dr. John Smith Jr.' -> 'JS'
        'Alice' -> 'A'
        '' -> '?'
    """
    if not full_name:
        return "?"

    # Split name into parts
    parts = [p for p in full_name.split() if p]
    if not parts:
        return "?"

    # Skip common prefixes/suffixes
    skip_words = {'dr.', 'dr', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms', 'jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv'}
    filtered = [p for p in parts if p.lower() not in skip_words]

    # Fall back to original parts if all were filtered out
    if not filtered:
        filtered = parts

    # Generate initials: first and last name
    if len(filtered) >= 2:
        return (filtered[0][0] + filtered[-1][0]).upper()
    elif filtered:
        return filtered[0][0].upper()

    return "?"
