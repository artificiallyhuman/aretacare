from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, date
from typing import Optional, List, Any


# ==========================================
# Platform Metrics Schemas
# ==========================================

class PlatformMetrics(BaseModel):
    """Current platform-wide metrics."""
    user_count: int
    weekly_active_percentage: float
    session_count: int
    avg_sessions_per_user: float
    collaborator_count: int
    avg_collaborators_per_user: float
    pending_invitation_count: int
    avg_pending_invitations_per_user: float
    waitlist_count: int
    waitlist_invited_count: int
    control_signups: bool
    document_count: int
    avg_documents_per_user: float
    audio_count: int
    avg_audio_per_user: float
    conversation_count: int
    avg_messages_per_user: float
    journal_count: int
    avg_journal_entries_per_user: float
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
    mfa_enabled: bool
    created_at: datetime
    last_active_session_id: Optional[str] = None
    sessions: List[AdminUserSession]
    total_documents: int
    total_audio: int
    total_conversations: int
    total_journals: int


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


# ==========================================
# Security Log Schemas
# ==========================================

class SecurityLogEntry(BaseModel):
    """Single security log entry."""
    id: int
    event_type: str
    email: Optional[str] = None
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    endpoint: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SecurityLogResponse(BaseModel):
    """Paginated security log response."""
    logs: List[SecurityLogEntry]
    total: int
    page: int
    page_size: int


# ==========================================
# Inactive Account Email Schemas
# ==========================================

class EmailInactiveUsersRequest(BaseModel):
    """Request to email inactive users."""
    user_ids: List[str] = Field(..., min_length=1, description="List of user IDs to email")


class EmailInactiveUsersResponse(BaseModel):
    """Response from emailing inactive users."""
    emails_sent: int
    emails_failed: int
    details: List[dict]


# ==========================================
# Error Log Schemas
# ==========================================

class ErrorLogEntry(BaseModel):
    """Single error log entry."""
    id: int
    timestamp: datetime
    level: str
    source: str
    message: str
    stack_trace: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    details: Optional[dict] = None

    class Config:
        from_attributes = True


class ErrorLogResponse(BaseModel):
    """Paginated error log response."""
    logs: List[ErrorLogEntry]
    total: int
    page: int
    page_size: int


class ErrorLogCleanupResponse(BaseModel):
    """Response from cleaning up old error logs."""
    deleted_count: int


# ==========================================
# API Log Schemas
# ==========================================

class ApiLogEntry(BaseModel):
    """Single API log entry (no sensitive user data)."""
    id: int
    feature: str
    input_tokens: int
    output_tokens: int
    success: bool
    error_message: Optional[str] = None
    model: Optional[str] = None
    response_time_ms: Optional[int] = None
    user_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ApiLogSummary(BaseModel):
    """Summary metrics for API logs."""
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    total_input_tokens: int
    total_output_tokens: int
    avg_response_time_ms: Optional[float] = None


class ApiLogResponse(BaseModel):
    """API log response with summary and entries."""
    summary: ApiLogSummary
    logs: List[ApiLogEntry]


# ==========================================
# Token Management Schemas
# ==========================================

class RefreshTokenInfo(BaseModel):
    """Information about a user's refresh token."""
    id: int
    created_at: datetime
    expires_at: datetime
    last_used_at: Optional[datetime] = None
    is_revoked: bool
    revoked_at: Optional[datetime] = None
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    is_expired: bool

    class Config:
        from_attributes = True


class UserTokensResponse(BaseModel):
    """Response containing all tokens for a user."""
    user_id: str
    user_email: str
    active_tokens: List[RefreshTokenInfo]
    revoked_tokens: List[RefreshTokenInfo]
    total_active: int
    total_revoked: int


class RevokeTokenResponse(BaseModel):
    """Response after revoking a token."""
    message: str
    revoked_token_id: int


# ==========================================
# Admin Email Campaign Schemas
# ==========================================

class EmailRecipientUser(BaseModel):
    """One user row in the email panel's recipient picker, with engagement metrics."""
    user_id: str
    email: str
    name: str
    created_at: datetime
    is_active: bool
    is_email_verified: bool
    last_login: Optional[datetime] = None
    last_activity: Optional[datetime] = None
    last_emailed_at: Optional[datetime] = None  # admin campaigns + inactive-account reminders only
    session_count: int
    conversation_count: int
    document_count: int
    audio_count: int
    journal_count: int
    features_used: List[str]
    unsubscribed: bool
    unsubscribed_at: Optional[datetime] = None


class EmailRecipientsResponse(BaseModel):
    """All users with metrics; the frontend filters/sorts/selects client-side."""
    generated_at: datetime
    smtp_configured: bool  # False = dev mode; sends will be recorded as skipped
    available_features: List[str]  # AdminService.EMAIL_RECIPIENT_FEATURES (fixed product-level list)
    users: List[EmailRecipientUser]


class CreateEmailCampaignRequest(BaseModel):
    """Request to create and send a product-update email campaign."""
    subject: str = Field(..., min_length=1, max_length=150)
    body_html: str = Field(..., min_length=1, max_length=200_000)
    user_ids: List[str] = Field(..., min_length=1, max_length=1000)


class EmailCampaignCreateResponse(BaseModel):
    """Response after a campaign is accepted for background sending."""
    campaign_id: str
    status: str
    total_recipients: int
    smtp_configured: bool


class EmailCampaignRecipientStatus(BaseModel):
    """Per-recipient outcome within a campaign."""
    user_id: Optional[str] = None
    email: str
    name: Optional[str] = None
    status: str  # pending | sent | failed | skipped
    error: Optional[str] = None
    sent_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmailCampaignStatus(BaseModel):
    """Campaign summary; status is the effective (stale-aware) status."""
    id: str
    subject: str
    admin_email: str
    status: str  # pending | sending | stalled | completed | completed_with_errors | failed
    total_recipients: int
    sent_count: int
    failed_count: int
    skipped_count: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    recipients: Optional[List[EmailCampaignRecipientStatus]] = None


class EmailCampaignListResponse(BaseModel):
    """Paginated campaign history, newest first."""
    total: int
    page: int
    limit: int
    campaigns: List[EmailCampaignStatus]
