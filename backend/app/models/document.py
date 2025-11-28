from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import enum


class DocumentCategory(str, enum.Enum):
    """AI-categorized document types"""
    LAB_RESULTS = "lab_results"
    IMAGING_REPORTS = "imaging_reports"
    CLINIC_NOTES = "clinic_notes"
    MEDICATION_RECORDS = "medication_records"
    DISCHARGE_SUMMARY = "discharge_summary"
    TREATMENT_PLAN = "treatment_plan"
    TEST_RESULTS = "test_results"
    REFERRAL = "referral"
    INSURANCE_BILLING = "insurance_billing"
    CONSENT_FORM = "consent_form"
    CARE_INSTRUCTIONS = "care_instructions"
    OTHER = "other"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)
    thumbnail_s3_key = Column(String, nullable=True)  # For PDF thumbnails
    content_type = Column(String, nullable=False)
    extracted_text = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # AI-generated metadata
    category = Column(SQLEnum(DocumentCategory), nullable=True, default=DocumentCategory.OTHER)
    ai_description = Column(Text, nullable=True)  # Brief AI-generated summary

    # Relationships
    session = relationship("Session", back_populates="documents")
