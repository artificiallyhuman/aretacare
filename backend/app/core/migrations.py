from sqlalchemy import text, inspect
from app.core.database import engine
import logging

logger = logging.getLogger(__name__)


def run_migrations():
    """Run database migrations for schema changes without full rebuild"""

    with engine.connect() as conn:
        inspector = inspect(engine)

        # Check if documents table exists
        if 'documents' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('documents')]

            # Add thumbnail_s3_key column if it doesn't exist
            if 'thumbnail_s3_key' not in columns:
                logger.info("Adding thumbnail_s3_key column to documents table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE documents ADD COLUMN thumbnail_s3_key VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added thumbnail_s3_key column")
                except Exception as e:
                    logger.error(f"Failed to add thumbnail_s3_key column: {e}")
                    conn.rollback()
            else:
                logger.info("thumbnail_s3_key column already exists")

            # Add category column if it doesn't exist
            if 'category' not in columns:
                logger.info("Adding category column to documents table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE documents ADD COLUMN category VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added category column to documents")
                except Exception as e:
                    logger.error(f"Failed to add category column to documents: {e}")
                    conn.rollback()
            else:
                logger.info("category column already exists in documents")

            # Add ai_description column if it doesn't exist
            if 'ai_description' not in columns:
                logger.info("Adding ai_description column to documents table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE documents ADD COLUMN ai_description TEXT NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added ai_description column to documents")
                except Exception as e:
                    logger.error(f"Failed to add ai_description column to documents: {e}")
                    conn.rollback()
            else:
                logger.info("ai_description column already exists in documents")

        # Check if audio_recordings table exists
        if 'audio_recordings' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('audio_recordings')]

            # Add category column if it doesn't exist
            if 'category' not in columns:
                logger.info("Adding category column to audio_recordings table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE audio_recordings ADD COLUMN category VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added category column")
                except Exception as e:
                    logger.error(f"Failed to add category column: {e}")
                    conn.rollback()
            else:
                logger.info("category column already exists")

            # Add ai_summary column if it doesn't exist
            if 'ai_summary' not in columns:
                logger.info("Adding ai_summary column to audio_recordings table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE audio_recordings ADD COLUMN ai_summary TEXT NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added ai_summary column")
                except Exception as e:
                    logger.error(f"Failed to add ai_summary column: {e}")
                    conn.rollback()
            else:
                logger.info("ai_summary column already exists")

            # Drop description column if it exists (merged into ai_summary)
            if 'description' in columns:
                logger.info("Dropping description column from audio_recordings table (merged into ai_summary)...")
                try:
                    conn.execute(text(
                        "ALTER TABLE audio_recordings DROP COLUMN description"
                    ))
                    conn.commit()
                    logger.info("Successfully dropped description column")
                except Exception as e:
                    logger.error(f"Failed to drop description column: {e}")
                    conn.rollback()
            else:
                logger.info("description column already removed")
