from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, text
from datetime import datetime
from app.core.database import Base


class AppNotice(Base):
    """
    An admin-published notice shown to every signed-in user on web and iOS.

    It exists for breach notifications: the FTC Health Breach Notification Rule allows
    email notice only alongside a second electronic channel, such as an in-app message
    (docs/BREACH_RESPONSE.md). At most one notice is active at a time. Rows are never
    deleted, so the table is the record of exactly what was shown, and when.
    """
    __tablename__ = "app_notices"

    id = Column(Integer, primary_key=True)
    title = Column(String(120), nullable=False)
    body = Column(Text, nullable=False)  # plain text; clients never render it as HTML/markdown
    link_url = Column(String(500), nullable=True)
    link_label = Column(String(60), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_email = Column(String(255), nullable=False)
    ended_at = Column(DateTime, nullable=True)
    ended_by_email = Column(String(255), nullable=True)

    __table_args__ = (
        # One live notice: publishing a new one ends the previous one in the same transaction.
        Index(
            "uq_app_notices_one_active",
            "is_active",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )
