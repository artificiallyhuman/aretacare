from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from enum import Enum


# ============================================================================
# PROFILE DATA STRUCTURE SCHEMAS
# ============================================================================

class PatientInfo(BaseModel):
    """Patient information"""
    full_name: Optional[str] = None
    preferred_name: Optional[str] = None
    date_of_birth: Optional[str] = None  # YYYY-MM-DD format
    age: Optional[str] = None  # String to allow things like "3 months"
    contact_info: Optional[str] = None
    location: Optional[str] = None


class CaregiverInfo(BaseModel):
    """Information about a caregiver"""
    id: Optional[str] = None  # Unique ID for this caregiver entry
    name: Optional[str] = None
    relationship: Optional[str] = None  # e.g., "Mother", "Father", "Spouse"
    role: Optional[str] = None  # e.g., "Primary caregiver", "Medical decision maker"
    contact_info: Optional[str] = None
    location: Optional[str] = None

    class Config:
        extra = "allow"


class ProviderInfo(BaseModel):
    """Information about a healthcare provider"""
    id: Optional[str] = None  # Unique ID for this provider entry
    name: Optional[str] = None
    specialty: Optional[str] = None
    organization: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    contact_info: Optional[str] = None  # Legacy free-form field; new entries should prefer phone/email/address

    class Config:
        extra = "allow"


class ConditionStatus(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    MONITORING = "monitoring"


class ConditionInfo(BaseModel):
    """Information about a medical condition or diagnosis"""
    id: Optional[str] = None  # Unique ID for this condition entry
    clinical_term: Optional[str] = None
    description: Optional[str] = None  # Non-jargon description
    status: Optional[str] = None  # active, resolved, monitoring
    diagnosis_date: Optional[str] = None
    details: Optional[str] = None  # Important details

    class Config:
        extra = "allow"


class MedicationInfo(BaseModel):
    """Information about a medication"""
    id: Optional[str] = None  # Unique ID for this medication entry
    name: Optional[str] = None
    description: Optional[str] = None  # Non-jargon description
    dose: Optional[str] = None
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    prescriber: Optional[str] = None
    notes: Optional[str] = None  # Side effects, adherence notes

    class Config:
        extra = "allow"


class AllergyInfo(BaseModel):
    """Information about an allergy or sensitivity"""
    id: Optional[str] = None  # Unique ID for this allergy entry
    substance: Optional[str] = None
    reaction: Optional[str] = None
    severity: Optional[str] = None  # mild, moderate, severe

    class Config:
        extra = "allow"


class EventInfo(BaseModel):
    """Information about a medical event in history"""
    id: Optional[str] = None  # Unique ID for this event entry
    event_type: Optional[str] = None  # hospitalization, surgery, er_visit, major_diagnosis
    description: Optional[str] = None
    date: Optional[str] = None
    details: Optional[str] = None

    class Config:
        extra = "allow"


class CommunicationPreference(BaseModel):
    """A specific communication preference"""
    id: Optional[str] = None
    category: Optional[str] = None  # e.g., "medical_discussions", "daily_care", "emotional_support"
    preference: Optional[str] = None
    details: Optional[str] = None

    class Config:
        extra = "allow"


class CaregivingGuideline(BaseModel):
    """A specific caregiving guideline"""
    id: Optional[str] = None
    category: Optional[str] = None  # e.g., "daily_routine", "medical_care", "nutrition", "mobility", "safety"
    guideline: Optional[str] = None
    importance: Optional[str] = None  # "critical", "important", "preferred"
    details: Optional[str] = None

    class Config:
        extra = "allow"


class ImportantContext(BaseModel):
    """Important context about the patient or care situation"""
    id: Optional[str] = None
    category: Optional[str] = None  # e.g., "personality", "history", "cultural", "religious", "social"
    context: Optional[str] = None
    details: Optional[str] = None

    class Config:
        extra = "allow"


class PreferencesInfo(BaseModel):
    """Structured preferences and human context"""
    communication_preferences: Optional[List[CommunicationPreference]] = None
    caregiving_guidelines: Optional[List[CaregivingGuideline]] = None
    important_context: Optional[List[ImportantContext]] = None
    emergency_instructions: Optional[str] = None  # Keep as single field for quick reference
    additional_notes: Optional[str] = None  # Catch-all for anything that doesn't fit elsewhere

    class Config:
        extra = "allow"


class ProfileData(BaseModel):
    """Complete profile data structure"""
    patient: Optional[PatientInfo] = None
    caregivers: Optional[List[CaregiverInfo]] = None
    providers: Optional[List[ProviderInfo]] = None
    conditions: Optional[List[ConditionInfo]] = None
    medications: Optional[List[MedicationInfo]] = None
    allergies: Optional[List[AllergyInfo]] = None
    events: Optional[List[EventInfo]] = None
    preferences: Optional[PreferencesInfo] = None

    class Config:
        extra = "allow"  # Allow additional fields for flexibility


# ============================================================================
# PENDING CHANGES SCHEMAS
# ============================================================================

class ChangeType(str, Enum):
    ADD = "add"
    EDIT = "edit"
    DELETE = "delete"


class PendingChange(BaseModel):
    """A proposed change from the AI that needs user approval"""
    id: str  # Unique ID for this change
    change_type: ChangeType
    field_path: str  # e.g., "patient.full_name" or "medications[2].dose"
    section: str  # e.g., "patient", "medications", "conditions"
    item_id: Optional[str] = None  # ID of the specific item being changed (for lists)
    old_value: Optional[Any] = None  # Current value (for edit/delete)
    new_value: Optional[Any] = None  # Proposed value (for add/edit)
    reasoning: str  # AI's explanation for the change


class PendingChangesReview(BaseModel):
    """User's review decisions on pending changes"""
    # Map of change_id -> decision ("accept", "reject", or edited value)
    decisions: Dict[str, Any]


# ============================================================================
# API REQUEST/RESPONSE SCHEMAS
# ============================================================================

class ProfileResponse(BaseModel):
    """Response schema for profile data"""
    id: int
    session_id: str
    profile_data: ProfileData
    pending_changes: Optional[List[PendingChange]] = None
    last_ai_update: Optional[datetime] = None
    last_user_update: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    """Schema for user updates to the profile"""
    profile_data: ProfileData


class ProfileSectionUpdate(BaseModel):
    """Schema for updating a specific section of the profile"""
    section: str  # e.g., "patient", "medications", "conditions"
    data: Any  # The updated data for that section


class ProfileRegenerateRequest(BaseModel):
    """Request to regenerate the profile from scratch"""
    confirm: bool = False


class ProfilePendingChangesResponse(BaseModel):
    """Response with only pending changes for review"""
    pending_changes: List[PendingChange]
    has_changes: bool


class ProfileCheckResponse(BaseModel):
    """Response for checking if profile update is available"""
    needs_update: bool
    has_profile: bool
    last_update: Optional[datetime] = None
    new_activity_count: int = 0  # Total number of new items
    new_conversation_count: int = 0  # Number of new conversation messages
    new_journal_count: int = 0  # Number of new journal entries


class ProfileExportFormat(str, Enum):
    PDF = "pdf"
    JSON = "json"
