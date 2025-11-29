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

        # Check if users table exists
        if 'users' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('users')]

            # Add reset_token column if it doesn't exist
            if 'reset_token' not in columns:
                logger.info("Adding reset_token column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN reset_token VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added reset_token column")
                except Exception as e:
                    logger.error(f"Failed to add reset_token column: {e}")
                    conn.rollback()
            else:
                logger.info("reset_token column already exists")

            # Add reset_token_expires column if it doesn't exist
            if 'reset_token_expires' not in columns:
                logger.info("Adding reset_token_expires column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN reset_token_expires TIMESTAMP NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added reset_token_expires column")
                except Exception as e:
                    logger.error(f"Failed to add reset_token_expires column: {e}")
                    conn.rollback()
            else:
                logger.info("reset_token_expires column already exists")

            # Add last_active_session_id column if it doesn't exist
            if 'last_active_session_id' not in columns:
                logger.info("Adding last_active_session_id column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN last_active_session_id VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added last_active_session_id column")
                except Exception as e:
                    logger.error(f"Failed to add last_active_session_id column: {e}")
                    conn.rollback()
            else:
                logger.info("last_active_session_id column already exists")

        # Check if sessions table exists
        if 'sessions' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('sessions')]

            # Add name column if it doesn't exist
            if 'name' not in columns:
                logger.info("Adding name column to sessions table...")
                try:
                    # Add the column with a default value
                    conn.execute(text(
                        "ALTER TABLE sessions ADD COLUMN name VARCHAR NOT NULL DEFAULT 'New Session'"
                    ))
                    conn.commit()
                    logger.info("Successfully added name column to sessions")

                    # Now update existing sessions with proper default names based on created_at order
                    logger.info("Updating existing sessions with default names...")
                    try:
                        # Get all sessions grouped by user, ordered by created_at
                        result = conn.execute(text("""
                            SELECT id, user_id, created_at,
                                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as session_number
                            FROM sessions
                            ORDER BY user_id, created_at
                        """))

                        sessions = result.fetchall()
                        for session in sessions:
                            session_id, user_id, created_at, session_number = session
                            new_name = f"Session {session_number}"
                            conn.execute(
                                text("UPDATE sessions SET name = :name WHERE id = :id"),
                                {"name": new_name, "id": session_id}
                            )

                        conn.commit()
                        logger.info(f"Updated {len(sessions)} existing sessions with default names")
                    except Exception as e:
                        logger.error(f"Failed to update session names: {e}")
                        conn.rollback()

                except Exception as e:
                    logger.error(f"Failed to add name column to sessions: {e}")
                    conn.rollback()
            else:
                logger.info("name column already exists in sessions")

            # Add owner_id column if it doesn't exist
            if 'owner_id' not in columns:
                logger.info("Adding owner_id column to sessions table...")
                try:
                    # Add the column
                    conn.execute(text(
                        "ALTER TABLE sessions ADD COLUMN owner_id VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added owner_id column to sessions")

                    # Set owner_id to user_id for all existing sessions
                    logger.info("Setting owner_id for existing sessions...")
                    conn.execute(text(
                        "UPDATE sessions SET owner_id = user_id WHERE owner_id IS NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully set owner_id for existing sessions")

                    # Make owner_id NOT NULL and add foreign key
                    logger.info("Making owner_id NOT NULL and adding foreign key...")
                    conn.execute(text(
                        "ALTER TABLE sessions ALTER COLUMN owner_id SET NOT NULL"
                    ))
                    conn.execute(text(
                        "ALTER TABLE sessions ADD CONSTRAINT fk_sessions_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE"
                    ))
                    conn.commit()
                    logger.info("Successfully configured owner_id column")

                except Exception as e:
                    logger.error(f"Failed to add owner_id column to sessions: {e}")
                    conn.rollback()
            else:
                logger.info("owner_id column already exists in sessions")

        # Create session_collaborators table if it doesn't exist
        if 'session_collaborators' not in inspector.get_table_names():
            logger.info("Creating session_collaborators table...")
            try:
                conn.execute(text("""
                    CREATE TABLE session_collaborators (
                        id VARCHAR PRIMARY KEY,
                        session_id VARCHAR NOT NULL,
                        user_id VARCHAR NOT NULL,
                        added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_session_collaborators_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                        CONSTRAINT fk_session_collaborators_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        CONSTRAINT unique_session_user UNIQUE (session_id, user_id)
                    )
                """))
                conn.commit()
                logger.info("Successfully created session_collaborators table")
            except Exception as e:
                logger.error(f"Failed to create session_collaborators table: {e}")
                conn.rollback()
        else:
            logger.info("session_collaborators table already exists")

        # ==========================================
        # PERFORMANCE INDEXES
        # ==========================================

        # Add index on conversations (session_id, created_at) for efficient history queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_conversations_session_created
                ON conversations (session_id, created_at)
            """))
            conn.commit()
            logger.info("Created index idx_conversations_session_created")
        except Exception as e:
            logger.warning(f"Index idx_conversations_session_created may already exist: {e}")
            conn.rollback()

        # Add index on documents (session_id, uploaded_at) for efficient listing
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_documents_session_uploaded
                ON documents (session_id, uploaded_at)
            """))
            conn.commit()
            logger.info("Created index idx_documents_session_uploaded")
        except Exception as e:
            logger.warning(f"Index idx_documents_session_uploaded may already exist: {e}")
            conn.rollback()

        # Add index on audio_recordings (session_id, created_at) for efficient listing
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_audio_recordings_session_created
                ON audio_recordings (session_id, created_at)
            """))
            conn.commit()
            logger.info("Created index idx_audio_recordings_session_created")
        except Exception as e:
            logger.warning(f"Index idx_audio_recordings_session_created may already exist: {e}")
            conn.rollback()

        # Add index on daily_plans (session_id, date) for efficient queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_daily_plans_session_date
                ON daily_plans (session_id, date)
            """))
            conn.commit()
            logger.info("Created index idx_daily_plans_session_date")
        except Exception as e:
            logger.warning(f"Index idx_daily_plans_session_date may already exist: {e}")
            conn.rollback()

        # Add index on session_collaborators (user_id) for finding user's collaborations
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_session_collaborators_user
                ON session_collaborators (user_id)
            """))
            conn.commit()
            logger.info("Created index idx_session_collaborators_user")
        except Exception as e:
            logger.warning(f"Index idx_session_collaborators_user may already exist: {e}")
            conn.rollback()

        # Add index on journal_entries (session_id, entry_date) for efficient queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_journal_entries_session_date
                ON journal_entries (session_id, entry_date DESC)
            """))
            conn.commit()
            logger.info("Created index idx_journal_entries_session_date")
        except Exception as e:
            logger.warning(f"Index idx_journal_entries_session_date may already exist: {e}")
            conn.rollback()
