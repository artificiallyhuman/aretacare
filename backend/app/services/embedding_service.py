"""
Embedding Service for Semantic Journal Retrieval

Generates and queries OpenAI embeddings for journal entries using pgvector.
All operations are non-fatal — failures log warnings but don't break journal
creation or conversation flows.
"""

from openai import AsyncOpenAI
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, timedelta
from typing import List, Optional, Tuple
import hashlib
import logging

from app.core.config import settings
from app.config import ai_config
from app.models.journal_entry_embedding import JournalEntryEmbedding
from app.models.journal import JournalEntry

logger = logging.getLogger(__name__)

DEFAULT_TOP_K = 10
MIN_SIMILARITY_THRESHOLD = 0.3  # Minimum cosine similarity to include in results
MIN_QUERY_LENGTH = 15  # Skip semantic search for very short messages (e.g., "Yes", "OK")

# Shared AsyncOpenAI client — avoids leaking httpx connection pools when
# EmbeddingService is instantiated per-request (which happens on every
# conversation message, journal create/update, and admin backfill).
_shared_async_client: Optional[AsyncOpenAI] = None

# Fast-fail client for query-time embedding (similarity search during conversation).
# Uses short timeout and no retries so the critical path isn't blocked by
# transient OpenAI outages — the search gracefully falls back to date-only context.
_shared_query_client: Optional[AsyncOpenAI] = None


def _get_shared_client() -> AsyncOpenAI:
    global _shared_async_client
    if _shared_async_client is None:
        _shared_async_client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=settings.OPENAI_TIMEOUT_SECONDS
        )
    return _shared_async_client


def _get_query_client() -> AsyncOpenAI:
    """Client for query-time embedding (similarity search) — fails fast."""
    global _shared_query_client
    if _shared_query_client is None:
        _shared_query_client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=10,
            max_retries=0
        )
    return _shared_query_client


def compute_content_hash(title: str, content: str) -> str:
    """Compute SHA-256 hash of journal entry content for change detection."""
    combined = f"{title}\n{content}"
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


class EmbeddingService:
    """Service for generating and querying journal entry embeddings."""

    def __init__(self, db: Session):
        self.db = db
        self.client = _get_shared_client()
        self.query_client = _get_query_client()

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding vector for text using OpenAI."""
        response = await self.client.embeddings.create(
            model=ai_config.EMBEDDING_MODEL,
            input=text
        )
        return response.data[0].embedding

    async def generate_embedding_fast(self, text: str) -> List[float]:
        """Generate embedding with short timeout and no retries for query-time use."""
        response = await self.query_client.embeddings.create(
            model=ai_config.EMBEDDING_MODEL,
            input=text
        )
        return response.data[0].embedding

    def _prepare_embedding_text(self, entry: JournalEntry, max_chars: int = 24000) -> str:
        """Prepare text for embedding from a journal entry.

        Combines type, date, title, and content for richer semantic representation.
        Truncates to stay within the 8192 token limit of the embedding model.
        Default 24K chars assumes ~3 chars/token worst case for dense/medical text.
        """
        parts = [
            f"[{entry.entry_type.value}]",
            f"Date: {entry.entry_date.isoformat()}",
            entry.title,
            entry.content
        ]
        text = "\n".join(parts)
        if len(text) > max_chars:
            text = text[:max_chars]
        return text

    async def embed_journal_entry(self, entry: JournalEntry) -> Optional[JournalEntryEmbedding]:
        """Generate and store embedding for a journal entry.

        Skips re-embedding if content is unchanged (based on content_hash).
        Updates embedding if content has changed.
        Retries with progressively shorter text if the token limit is exceeded.
        """
        try:
            content_hash = compute_content_hash(entry.title, entry.content)

            # Check if embedding already exists with same content
            existing = self.db.query(JournalEntryEmbedding).filter(
                JournalEntryEmbedding.journal_entry_id == entry.id
            ).first()

            if existing and existing.content_hash == content_hash:
                return existing

            # Generate embedding with progressive truncation on token limit errors
            vector = None
            for max_chars in [24000, 16000, 8000]:
                try:
                    embedding_text = self._prepare_embedding_text(entry, max_chars=max_chars)
                    vector = await self.generate_embedding(embedding_text)
                    break
                except Exception as e:
                    if "maximum context length" in str(e).lower() or "8192" in str(e):
                        logger.warning(f"Entry {entry.id} exceeded token limit at {max_chars} chars, retrying with shorter text")
                        continue
                    raise

            if vector is None:
                logger.error(f"Entry {entry.id} exceeded token limit even at minimum truncation")
                return None

            if existing:
                existing.embedding = vector
                existing.content_hash = content_hash
                existing.embedding_model = ai_config.EMBEDDING_MODEL
                self.db.commit()
                self.db.refresh(existing)
                return existing
            else:
                embedding_record = JournalEntryEmbedding(
                    journal_entry_id=entry.id,
                    session_id=entry.session_id,
                    embedding=vector,
                    embedding_model=ai_config.EMBEDDING_MODEL,
                    content_hash=content_hash
                )
                self.db.add(embedding_record)
                self.db.commit()
                self.db.refresh(embedding_record)
                return embedding_record

        except Exception as e:
            self.db.rollback()
            logger.warning(f"Failed to embed journal entry {entry.id}: {e}")
            return None

    async def find_similar_entries(
        self,
        session_id: str,
        query_text: str,
        exclude_entry_ids: Optional[List[int]] = None,
        top_k: int = DEFAULT_TOP_K,
        min_days_old: int = 8,
        min_similarity: float = MIN_SIMILARITY_THRESHOLD
    ) -> List[Tuple[JournalEntry, float]]:
        """Find journal entries semantically similar to query text.

        Returns entries sorted by similarity (highest first), excluding
        entries from the last min_days_old days and any in exclude_entry_ids.
        Skips search entirely for very short messages (< MIN_QUERY_LENGTH chars)
        whose embeddings lack discriminative power.
        """
        try:
            # Short messages like "Yes", "OK", "Thanks" produce near-random
            # similarity scores — skip to avoid injecting unrelated context.
            if len(query_text.strip()) < MIN_QUERY_LENGTH:
                logger.info(f"Skipping semantic search — query too short ({len(query_text.strip())} chars)")
                return []

            query_vector = await self.generate_embedding_fast(query_text)
            cutoff_date = date.today() - timedelta(days=min_days_old)

            # pgvector cosine distance: 1 - (a <=> b) = cosine similarity
            # Use CAST() instead of :: to avoid conflict with SQLAlchemy's :param syntax
            if exclude_entry_ids:
                query = text("""
                    SELECT
                        je.id,
                        1 - (jee.embedding <=> CAST(:query_vector AS vector)) as similarity
                    FROM journal_entry_embeddings jee
                    JOIN journal_entries je ON je.id = jee.journal_entry_id
                    WHERE jee.session_id = :session_id
                      AND je.entry_date < :cutoff_date
                      AND je.id != ALL(:exclude_ids)
                    ORDER BY jee.embedding <=> CAST(:query_vector AS vector)
                    LIMIT :top_k
                """)
                params = {
                    "query_vector": str(query_vector),
                    "session_id": session_id,
                    "cutoff_date": cutoff_date,
                    "exclude_ids": exclude_entry_ids,
                    "top_k": top_k
                }
            else:
                query = text("""
                    SELECT
                        je.id,
                        1 - (jee.embedding <=> CAST(:query_vector AS vector)) as similarity
                    FROM journal_entry_embeddings jee
                    JOIN journal_entries je ON je.id = jee.journal_entry_id
                    WHERE jee.session_id = :session_id
                      AND je.entry_date < :cutoff_date
                    ORDER BY jee.embedding <=> CAST(:query_vector AS vector)
                    LIMIT :top_k
                """)
                params = {
                    "query_vector": str(query_vector),
                    "session_id": session_id,
                    "cutoff_date": cutoff_date,
                    "top_k": top_k
                }

            result = self.db.execute(query, params)
            rows = result.fetchall()

            similar_entries = []
            for row in rows:
                entry_id, similarity = row
                if float(similarity) < min_similarity:
                    break  # Results are sorted by similarity desc; remaining are lower
                entry = self.db.query(JournalEntry).filter(
                    JournalEntry.id == entry_id
                ).first()
                if entry:
                    similar_entries.append((entry, float(similarity)))

            return similar_entries

        except Exception as e:
            self.db.rollback()
            logger.warning(f"Similarity search failed for session {session_id}: {e}")
            return []

    async def backfill_session(self, session_id: str) -> dict:
        """Backfill embeddings for all journal entries in a session."""
        entries = self.db.query(JournalEntry).filter(
            JournalEntry.session_id == session_id
        ).all()

        stats = {"total": len(entries), "embedded": 0, "skipped": 0, "failed": 0}

        for entry in entries:
            try:
                content_hash = compute_content_hash(entry.title, entry.content)
                existing = self.db.query(JournalEntryEmbedding).filter(
                    JournalEntryEmbedding.journal_entry_id == entry.id
                ).first()

                if existing and existing.content_hash == content_hash:
                    stats["skipped"] += 1
                    continue

                result = await self.embed_journal_entry(entry)
                if result:
                    stats["embedded"] += 1
                else:
                    stats["failed"] += 1
            except Exception as e:
                logger.error(f"Failed to backfill entry {entry.id}: {e}")
                stats["failed"] += 1

        return stats

    async def backfill_all(self, batch_size: int = 50) -> dict:
        """Backfill embeddings for all journal entries without embeddings.

        Processes in batches to avoid API rate limits.
        """
        entries = self.db.query(JournalEntry).outerjoin(
            JournalEntryEmbedding,
            JournalEntry.id == JournalEntryEmbedding.journal_entry_id
        ).filter(
            JournalEntryEmbedding.id.is_(None)
        ).limit(batch_size).all()

        stats = {"total": len(entries), "embedded": 0, "failed": 0}

        for entry in entries:
            try:
                result = await self.embed_journal_entry(entry)
                if result:
                    stats["embedded"] += 1
                else:
                    stats["failed"] += 1
            except Exception as e:
                logger.error(f"Failed to backfill entry {entry.id}: {e}")
                stats["failed"] += 1

        remaining = self.db.query(JournalEntry).outerjoin(
            JournalEntryEmbedding,
            JournalEntry.id == JournalEntryEmbedding.journal_entry_id
        ).filter(
            JournalEntryEmbedding.id.is_(None)
        ).count()

        stats["remaining"] = remaining

        return stats
