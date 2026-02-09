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
    IDENTIFICATION = "identification"
    CORRESPONDENCE = "correspondence"
    OTHER = "other"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    s3_key = Column(String, nullable=False)
    thumbnail_s3_key = Column(String, nullable=True)  # For PDF thumbnails
    content_type = Column(String, nullable=False)
    extracted_text = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # AI-generated metadata
    category = Column(SQLEnum(DocumentCategory), nullable=True, default=DocumentCategory.OTHER)
    ai_description = Column(Text, nullable=True)  # Brief AI-generated summary

    # Source tracking for collaborative sessions
    uploaded_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    last_edited_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    session = relationship("Session", back_populates="documents")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
    last_edited_by = relationship("User", foreign_keys=[last_edited_by_user_id])
