from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey
from datetime import datetime
from app.core.database import Base
import uuid


class EmailCampaign(Base):
    """An admin-sent product-update email: subject/body plus send progress.

    Sending runs in a background thread (services/email_campaign_service.py);
    `updated_at` is the job heartbeat behind the stale/"stalled" rule, mirroring
    audio_recordings.transcription_updated_at.
    """
    __tablename__ = "email_campaigns"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Admin email is preserved even if the admin account is later deleted,
    # same rationale as AdminAuditLog.admin_email.
    admin_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    admin_email = Column(String, nullable=False)

    subject = Column(String(200), nullable=False)
    body_html = Column(Text, nullable=False)  # sanitized fragment (nh3 allowlist), never raw editor HTML
    body_text = Column(Text, nullable=False)  # generated plain-text alternative

    # pending | sending | completed | completed_with_errors | failed
    # ("stalled" is a read-time interpretation of a stale 'sending', never stored)
    status = Column(String(30), nullable=False, default="pending", index=True)

    total_recipients = Column(Integer, nullable=False, default=0)
    sent_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    skipped_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class EmailCampaignRecipient(Base):
    """Per-recipient outcome of a campaign send.

    Email and name are preserved so the send report stays readable after a
    user deletes their account (user_id goes NULL, no mail is sent to a row
    whose user is gone).
    """
    __tablename__ = "email_campaign_recipients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(String, ForeignKey("email_campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    email = Column(String, nullable=False)
    name = Column(String, nullable=True)

    # pending | sending (in-flight, claimed atomically) | sent | failed | skipped
    status = Column(String(20), nullable=False, default="pending")
    # smtp_send_failed | interrupted | unsubscribed | user_deleted | user_ineligible | smtp_not_configured
    error = Column(String, nullable=True)
    sent_at = Column(DateTime, nullable=True)
