from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class AdminAuditLog(Base):
    """
    Audit log for tracking admin actions.

    Records all administrative actions for compliance and debugging.
    Admin email is stored separately to preserve the record even if the admin user is deleted.
    """
    __tablename__ = "admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    admin_email = Column(String, nullable=False)  # Preserved even if admin is deleted
    action = Column(String, nullable=False)  # e.g., "password_reset", "user_delete", "session_transfer"
    target_type = Column(String, nullable=True)  # e.g., "user", "session", "s3_file"
    target_id = Column(String, nullable=True)  # ID of the affected entity
    details = Column(JSONB, nullable=True)  # Additional context (JSON)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship to admin user (may be null if admin was deleted)
    admin_user = relationship("User", foreign_keys=[admin_user_id])

    def __repr__(self):
        return f"<AdminAuditLog {self.id}: {self.action} by {self.admin_email}>"
