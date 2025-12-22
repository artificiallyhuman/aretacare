"""Pydantic schemas for admin report API."""
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel


class AdminReportResponse(BaseModel):
    """Schema for admin report response."""
    id: int
    date: date
    content: str
    has_concerns: bool
    security_log_count: int
    error_log_count: int
    api_log_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class AdminReportListResponse(BaseModel):
    """Schema for list of admin reports."""
    reports: List[AdminReportResponse]
    total: int


class AdminReportGenerateResponse(BaseModel):
    """Schema for generate report response."""
    report: AdminReportResponse
    message: str
