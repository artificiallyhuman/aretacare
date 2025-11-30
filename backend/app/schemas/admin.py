from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, date
from typing import Optional, List, Any


# ==========================================
# Platform Metrics Schemas
# ==========================================

class PlatformMetrics(BaseModel):
    """Current platform-wide metrics."""
    user_count: int
    session_count: int
    document_count: int
    audio_count: int
    conversation_count: int
    journal_count: int
    daily_plan_count: int


class MetricsTrend(BaseModel):
    """Single data point in a metrics trend."""
    date: date
    count: int


class MetricsTrendResponse(BaseModel):
    """Response containing metrics trend data."""
    metric: str
    days: int
    data: List[MetricsTrend]


# ==========================================
# Account Analysis Schemas
# ==========================================

class InactiveAccount(BaseModel):
    """User account with no recent activity."""
    user_id: str
    email: str
    name: str
    last_activity: Optional[datetime] = None
    days_inactive: int
    session_count: int
    created_at: datetime


class UnusualAccount(BaseModel):
    """User account with unusual activity patterns."""
    user_id: str
    email: str
    name: str
    metric_type: str  # e.g., "conversation_count", "document_count", "audio_count"
    value: float
    average: float
    std_dev: float
    z_score: float  # How many standard deviations from mean
    session_count: int


# ==========================================
# User Administration Schemas
# ==========================================

class AdminUserSearch(BaseModel):
    """Schema for user search query."""
    email: str = Field(..., min_length=1)


class AdminUserSession(BaseModel):
    """Session summary for admin view."""
    id: str
    name: str
    is_owner: bool
    created_at: datetime
    last_activity: Optional[datetime] = None
    document_count: int
    audio_count: int
    conversation_count: int
    journal_count: int
    collaborator_count: int


class AdminUserDetail(BaseModel):
    """Detailed user information for admin view."""
    id: str
    email: str
    name: str
    is_active: bool
    created_at: datetime
    last_active_session_id: Optional[str] = None
    sessions: List[AdminUserSession]
    total_documents: int
    total_audio: int
    total_conversations: int


class AdminUserSummary(BaseModel):
    """Summary user information for search results."""
    id: str
    email: str
    name: str
    is_active: bool
    created_at: datetime
    session_count: int
    total_documents: int
    total_conversations: int


class PasswordResetByAdmin(BaseModel):
    """Response when admin triggers password reset."""
    message: str
    email_sent: bool


class SessionTransfer(BaseModel):
    """Schema for transferring session ownership."""
    new_owner_email: EmailStr


class SessionTransferResponse(BaseModel):
    """Response for session transfer."""
    message: str
    session_id: str
    new_owner_id: str
    new_owner_email: str


# ==========================================
# S3 Orphan Management Schemas
# ==========================================

class OrphanedS3File(BaseModel):
    """S3 file not referenced in database."""
    key: str
    file_type: str  # "document", "thumbnail", "audio"
    size: int  # bytes
    last_modified: datetime


class OrphanedS3Summary(BaseModel):
    """Summary of orphaned S3 files."""
    total_count: int
    total_size: int  # bytes
    by_type: dict  # {"document": count, "thumbnail": count, "audio": count}
    files: List[OrphanedS3File]


class S3DeleteRequest(BaseModel):
    """Request to delete orphaned S3 files."""
    keys: List[str]


class S3DeleteResponse(BaseModel):
    """Response from S3 delete operation."""
    deleted_count: int
    failed_count: int
    failed_keys: List[str]


# ==========================================
# Audit Log Schemas
# ==========================================

class AuditLogEntry(BaseModel):
    """Single audit log entry."""
    id: int
    admin_email: str
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    """Paginated audit log response."""
    total: int
    page: int
    limit: int
    entries: List[AuditLogEntry]


# ==========================================
# System Health Schemas
# ==========================================

class ServiceStatus(BaseModel):
    """Status of a single service."""
    name: str
    status: str  # "healthy", "degraded", "unhealthy"
    latency_ms: Optional[float] = None
    message: Optional[str] = None


class SystemHealth(BaseModel):
    """Overall system health status."""
    status: str  # "healthy", "degraded", "unhealthy"
    services: List[ServiceStatus]
    checked_at: datetime


# ==========================================
# Admin Check Schema
# ==========================================

class AdminCheckResponse(BaseModel):
    """Response for admin status check."""
    is_admin: bool


class AuditLogCleanupResponse(BaseModel):
    """Response for audit log cleanup."""
    deleted_count: int
    retention_days: int
    message: str
