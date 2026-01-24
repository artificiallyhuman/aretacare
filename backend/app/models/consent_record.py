"""
Consent record model for tracking user consent during registration.
Records the exact text agreed to, IP address, and timestamp for compliance verification.
"""
import enum
from sqlalchemy import Column, String, Text, DateTime, Integer, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ConsentType(str, enum.Enum):
    """Types of consent collected during registration and other actions."""
    MEDICAL_ADVICE = "medical_advice"  # Acknowledges not medical advice
    HIPAA = "hipaa"  # Acknowledges consumer tool, not HIPAA-covered
    DATA_PROCESSING = "data_processing"  # Consents to data collection/storage/processing
    TERMS_PRIVACY = "terms_privacy"  # Agrees to Terms of Service and Privacy Policy
    AGE_USE = "age_use"  # Confirms 18+ and lawful use
    SHARING_AUTHORIZATION = "sharing_authorization"  # Confirms right to share session with collaborator


# Consent text versions - update version when text changes
CONSENT_VERSIONS = {
    ConsentType.MEDICAL_ADVICE: {
        "version": "1.0",
        "text": "I understand that AretaCare is not a medical professional and does not provide medical advice, diagnosis, or treatment. I will consult qualified healthcare professionals for medical decisions and emergencies."
    },
    ConsentType.HIPAA: {
        "version": "1.0",
        "text": "I understand that AretaCare is a consumer tool, not a HIPAA-covered service, and is not a medical record system. I will not rely on it as my sole repository for critical health information."
    },
    ConsentType.DATA_PROCESSING: {
        "version": "1.0",
        "text": "I consent to the collection, storage, and processing of my information as described in the Privacy Policy, including processing by AI systems to help organize, summarize, and interpret content."
    },
    ConsentType.TERMS_PRIVACY: {
        "version": "1.0",
        "text": "I agree to the Terms of Service and Privacy Policy."
    },
    ConsentType.AGE_USE: {
        "version": "1.0",
        "text": "I am at least 18 years old and will use AretaCare only for lawful, personal purposes."
    },
    ConsentType.SHARING_AUTHORIZATION: {
        "version": "1.0",
        "text": "I confirm I have the right to share the information in this session with the collaborator I'm adding. If I'm the patient, this is my consent. If I'm a caregiver, I have the patient's permission to share it."
    }
}


class ConsentRecord(Base):
    """Records user consent for compliance and audit purposes."""
    __tablename__ = "consent_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    consent_type = Column(Enum(ConsentType, native_enum=False), nullable=False, index=True)
    consent_version = Column(String(20), nullable=False)  # e.g., "1.0", "1.1"
    consent_text = Column(Text, nullable=False)  # Exact text agreed to
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(500), nullable=True)  # Browser/client info
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Context fields for sharing consents (nullable for registration consents)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    shared_with_email = Column(String(255), nullable=True)  # Email of person being shared with

    # Relationship
    user = relationship("User", back_populates="consent_records")

    def __repr__(self):
        return f"<ConsentRecord(id={self.id}, user_id={self.user_id}, type={self.consent_type}, version={self.consent_version})>"
