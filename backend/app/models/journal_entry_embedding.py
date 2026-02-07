from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from datetime import datetime
from app.core.database import Base


class JournalEntryEmbedding(Base):
    __tablename__ = "journal_entry_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    journal_entry_id = Column(
        Integer,
        ForeignKey("journal_entries.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True
    )
    session_id = Column(
        String,
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    embedding = Column(Vector(1536), nullable=False)
    embedding_model = Column(String(50), nullable=False, default="text-embedding-3-small")
    content_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    journal_entry = relationship("JournalEntry")
