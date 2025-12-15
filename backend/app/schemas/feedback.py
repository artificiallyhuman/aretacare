from pydantic import BaseModel, EmailStr, Field, field_validator
from enum import Enum
from typing import List


class FeedbackType(str, Enum):
    """Types of feedback"""
    BUG = "bug"
    IMPROVEMENT = "improvement"
    FEATURE = "feature"
    OTHER = "other"


class FeedbackSubmit(BaseModel):
    """Schema for submitting feedback"""
    name: str = Field(..., min_length=1, max_length=255, description="User's name")
    email: EmailStr = Field(..., description="User's email address")
    feedback_types: List[FeedbackType] = Field(..., min_length=1, description="Types of feedback (at least one required)")
    message: str = Field(..., min_length=10, max_length=5000, description="Feedback message")
    captcha_token: str = Field(..., description="hCaptcha token for verification")

    # Optional metadata for diagnostics (privacy-conscious)
    user_agent: str | None = Field(None, max_length=500, description="Browser user agent")
    page_url: str | None = Field(None, max_length=1000, description="Page where feedback was initiated")

    @field_validator('feedback_types')
    @classmethod
    def validate_feedback_types(cls, v):
        if not v or len(v) == 0:
            raise ValueError('At least one feedback type must be selected')
        return v


class FeedbackResponse(BaseModel):
    """Schema for feedback submission response"""
    success: bool
    message: str
