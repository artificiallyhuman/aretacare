from sqlalchemy import text, inspect
from app.core.database import engine
import logging

logger = logging.getLogger(__name__)


def has_migration_run(conn, migration_name: str) -> bool:
    """Check if a one-time migration has already been applied"""
    try:
        result = conn.execute(
            text("SELECT 1 FROM migration_history WHERE migration_name = :name"),
            {"name": migration_name}
        )
        return result.fetchone() is not None
    except Exception:
        # Table doesn't exist yet
        return False


def mark_migration_complete(conn, migration_name: str):
    """Record that a migration has been applied"""
    try:
        conn.execute(
            text("INSERT INTO migration_history (migration_name) VALUES (:name)"),
            {"name": migration_name}
        )
        conn.commit()
        logger.info(f"Marked migration '{migration_name}' as complete")
    except Exception as e:
        logger.error(f"Failed to mark migration '{migration_name}' as complete: {e}")
        conn.rollback()


def run_migrations():
    """Run database migrations for schema changes without full rebuild"""

    with engine.connect() as conn:
        inspector = inspect(engine)

        # Create migration_history table if it doesn't exist
        if 'migration_history' not in inspector.get_table_names():
            logger.info("Creating migration_history table...")
            try:
                conn.execute(text("""
                    CREATE TABLE migration_history (
                        id SERIAL PRIMARY KEY,
                        migration_name VARCHAR(255) UNIQUE NOT NULL,
                        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created migration_history table")
            except Exception as e:
                logger.error(f"Failed to create migration_history table: {e}")
                conn.rollback()

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

            # Add email change verification columns if they don't exist
            if 'pending_email' not in columns:
                logger.info("Adding pending_email column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN pending_email VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added pending_email column")
                except Exception as e:
                    logger.error(f"Failed to add pending_email column: {e}")
                    conn.rollback()
            else:
                logger.info("pending_email column already exists")

            if 'email_change_token' not in columns:
                logger.info("Adding email_change_token column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN email_change_token VARCHAR NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added email_change_token column")
                except Exception as e:
                    logger.error(f"Failed to add email_change_token column: {e}")
                    conn.rollback()
            else:
                logger.info("email_change_token column already exists")

            if 'email_change_token_expires' not in columns:
                logger.info("Adding email_change_token_expires column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN email_change_token_expires TIMESTAMP NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added email_change_token_expires column")
                except Exception as e:
                    logger.error(f"Failed to add email_change_token_expires column: {e}")
                    conn.rollback()
            else:
                logger.info("email_change_token_expires column already exists")

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

            # Remove deprecated columns (is_primary, journal_entry_count, last_journal_synthesis)
            # These were part of an older design and are no longer used
            deprecated_columns = ['is_primary', 'journal_entry_count', 'last_journal_synthesis']
            for col_name in deprecated_columns:
                if col_name in columns:
                    logger.info(f"Removing deprecated column '{col_name}' from sessions table...")
                    try:
                        conn.execute(text(f"ALTER TABLE sessions DROP COLUMN IF EXISTS {col_name}"))
                        conn.commit()
                        logger.info(f"Successfully removed '{col_name}' column from sessions")
                    except Exception as e:
                        logger.error(f"Failed to remove '{col_name}' column: {e}")
                        conn.rollback()

            # Remove deprecated index for primary sessions
            try:
                # Check if index exists before trying to drop it
                result = conn.execute(text("""
                    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_primary'
                """))
                if result.fetchone():
                    logger.info("Removing deprecated idx_user_primary index...")
                    conn.execute(text("DROP INDEX IF EXISTS idx_user_primary"))
                    conn.commit()
                    logger.info("Successfully removed idx_user_primary index")
            except Exception as e:
                logger.error(f"Failed to remove idx_user_primary index: {e}")
                conn.rollback()

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
        # ENUM TYPE UPDATES
        # ==========================================

        # Add 'OTHER' to entrytype enum if it doesn't exist
        if 'journal_entries' in inspector.get_table_names():
            logger.info("Checking entrytype enum for 'OTHER' value...")
            try:
                # Check if OTHER already exists in the enum
                result = conn.execute(text("""
                    SELECT EXISTS (
                        SELECT 1 FROM pg_enum
                        WHERE enumlabel = 'OTHER'
                        AND enumtypid = (
                            SELECT oid FROM pg_type WHERE typname = 'entrytype'
                        )
                    )
                """))
                has_other = result.scalar()

                if not has_other:
                    logger.info("Adding 'OTHER' to entrytype enum...")
                    conn.execute(text("ALTER TYPE entrytype ADD VALUE 'OTHER'"))
                    conn.commit()
                    logger.info("Successfully added 'OTHER' to entrytype enum")
                else:
                    logger.info("'OTHER' already exists in entrytype enum")
            except Exception as e:
                logger.error(f"Failed to update entrytype enum: {e}")
                conn.rollback()

        # Fix AudioRecordingCategory and DocumentCategory enums
        # These were created as VARCHAR initially, need to convert to proper enums
        logger.info("Checking if category enums need to be created/fixed...")

        try:
            # Check if audiorecordingcategory enum exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'audiorecordingcategory'
                )
            """))
            audio_enum_exists = result.scalar()

            if not audio_enum_exists:
                logger.info("Creating audiorecordingcategory enum type...")
                conn.execute(text("""
                    CREATE TYPE audiorecordingcategory AS ENUM (
                        'symptom_update', 'appointment_recap', 'medication_note',
                        'question_for_doctor', 'daily_reflection', 'progress_update',
                        'side_effects', 'care_instruction', 'emergency_note',
                        'family_update', 'treatment_observation', 'other'
                    )
                """))
                conn.commit()
                logger.info("Successfully created audiorecordingcategory enum")

                # Update the column to use the enum type
                if 'audio_recordings' in inspector.get_table_names():
                    logger.info("Converting audio_recordings.category to enum type...")
                    conn.execute(text("""
                        ALTER TABLE audio_recordings
                        ALTER COLUMN category TYPE audiorecordingcategory
                        USING category::audiorecordingcategory
                    """))
                    conn.commit()
                    logger.info("Successfully converted audio_recordings.category to enum")
            else:
                logger.info("audiorecordingcategory enum already exists")

        except Exception as e:
            logger.error(f"Failed to create/fix audiorecordingcategory enum: {e}")
            conn.rollback()

        try:
            # Check if documentcategory enum exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'documentcategory'
                )
            """))
            doc_enum_exists = result.scalar()

            if not doc_enum_exists:
                logger.info("Creating documentcategory enum type...")
                conn.execute(text("""
                    CREATE TYPE documentcategory AS ENUM (
                        'lab_results', 'imaging_reports', 'clinic_notes',
                        'medication_records', 'discharge_summary', 'treatment_plan',
                        'test_results', 'referral', 'insurance_billing',
                        'consent_form', 'care_instructions', 'other'
                    )
                """))
                conn.commit()
                logger.info("Successfully created documentcategory enum")

                # Update the column to use the enum type
                if 'documents' in inspector.get_table_names():
                    logger.info("Converting documents.category to enum type...")
                    conn.execute(text("""
                        ALTER TABLE documents
                        ALTER COLUMN category TYPE documentcategory
                        USING category::documentcategory
                    """))
                    conn.commit()
                    logger.info("Successfully converted documents.category to enum")
            else:
                logger.info("documentcategory enum already exists")

        except Exception as e:
            logger.error(f"Failed to create/fix documentcategory enum: {e}")
            conn.rollback()

        # Add new category values to existing enums
        try:
            for value in ['identification', 'correspondence']:
                result = conn.execute(text("""
                    SELECT EXISTS (
                        SELECT 1 FROM pg_enum
                        WHERE enumlabel = :val
                        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'documentcategory')
                    )
                """), {"val": value})
                if not result.scalar():
                    logger.info(f"Adding '{value}' to documentcategory enum...")
                    conn.execute(text(f"ALTER TYPE documentcategory ADD VALUE '{value}'"))
                    conn.commit()
                    logger.info(f"Successfully added '{value}' to documentcategory enum")
        except Exception as e:
            logger.error(f"Failed to add new documentcategory values: {e}")
            conn.rollback()

        try:
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'provider_conversation'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audiorecordingcategory')
                )
            """))
            if not result.scalar():
                logger.info("Adding 'provider_conversation' to audiorecordingcategory enum...")
                conn.execute(text("ALTER TYPE audiorecordingcategory ADD VALUE 'provider_conversation'"))
                conn.commit()
                logger.info("Successfully added 'provider_conversation' to audiorecordingcategory enum")
        except Exception as e:
            logger.error(f"Failed to add new audiorecordingcategory values: {e}")
            conn.rollback()

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

        # Add index on documents (category) for category filtering
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_documents_category
                ON documents (category)
            """))
            conn.commit()
            logger.info("Created index idx_documents_category")
        except Exception as e:
            logger.warning(f"Index idx_documents_category may already exist: {e}")
            conn.rollback()

        # Add index on audio_recordings (category) for category filtering
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_audio_recordings_category
                ON audio_recordings (category)
            """))
            conn.commit()
            logger.info("Created index idx_audio_recordings_category")
        except Exception as e:
            logger.warning(f"Index idx_audio_recordings_category may already exist: {e}")
            conn.rollback()

        # Add index on session_collaborators (session_id) for session lookups
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_session_collaborators_session
                ON session_collaborators (session_id)
            """))
            conn.commit()
            logger.info("Created index idx_session_collaborators_session")
        except Exception as e:
            logger.warning(f"Index idx_session_collaborators_session may already exist: {e}")
            conn.rollback()

        # Add index on journal_entries (session_id, created_at) for daily plan queries
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_journal_entries_session_created
                ON journal_entries (session_id, created_at DESC)
            """))
            conn.commit()
            logger.info("Created index idx_journal_entries_session_created")
        except Exception as e:
            logger.warning(f"Index idx_journal_entries_session_created may already exist: {e}")
            conn.rollback()

        # ==========================================
        # ADMIN AUDIT LOG TABLE
        # ==========================================

        # Create admin_audit_logs table if it doesn't exist
        if 'admin_audit_logs' not in inspector.get_table_names():
            logger.info("Creating admin_audit_logs table...")
            try:
                conn.execute(text("""
                    CREATE TABLE admin_audit_logs (
                        id SERIAL PRIMARY KEY,
                        admin_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
                        admin_email VARCHAR NOT NULL,
                        action VARCHAR NOT NULL,
                        target_type VARCHAR,
                        target_id VARCHAR,
                        details JSONB,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created admin_audit_logs table")

                # Create index for efficient queries by date
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
                    ON admin_audit_logs (created_at DESC)
                """))
                conn.commit()
                logger.info("Created index idx_admin_audit_logs_created_at")

                # Create index for filtering by action
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
                    ON admin_audit_logs (action)
                """))
                conn.commit()
                logger.info("Created index idx_admin_audit_logs_action")

            except Exception as e:
                logger.error(f"Failed to create admin_audit_logs table: {e}")
                conn.rollback()
        else:
            logger.info("admin_audit_logs table already exists")

        # ==========================================
        # SECURITY LOGS TABLE
        # ==========================================

        # Create security_logs table if it doesn't exist
        if 'security_logs' not in inspector.get_table_names():
            logger.info("Creating security_logs table...")
            try:
                conn.execute(text("""
                    CREATE TABLE security_logs (
                        id SERIAL PRIMARY KEY,
                        event_type VARCHAR(50) NOT NULL,
                        email VARCHAR(255),
                        user_id VARCHAR(36),
                        ip_address VARCHAR(45),
                        user_agent VARCHAR(500),
                        endpoint VARCHAR(255),
                        details TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created security_logs table")

                # Create indexes for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_security_logs_created_at
                    ON security_logs (created_at DESC)
                """))
                conn.commit()
                logger.info("Created index idx_security_logs_created_at")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_security_logs_event_type
                    ON security_logs (event_type)
                """))
                conn.commit()
                logger.info("Created index idx_security_logs_event_type")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_security_logs_email
                    ON security_logs (email)
                """))
                conn.commit()
                logger.info("Created index idx_security_logs_email")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_security_logs_user_id
                    ON security_logs (user_id)
                """))
                conn.commit()
                logger.info("Created index idx_security_logs_user_id")

            except Exception as e:
                logger.error(f"Failed to create security_logs table: {e}")
                conn.rollback()
        else:
            logger.info("security_logs table already exists")

        # ==========================================
        # ERROR LOGS TABLE
        # ==========================================

        # Create error_logs table if it doesn't exist
        if 'error_logs' not in inspector.get_table_names():
            logger.info("Creating error_logs table...")
            try:
                conn.execute(text("""
                    CREATE TABLE error_logs (
                        id SERIAL PRIMARY KEY,
                        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        level VARCHAR(20) NOT NULL,
                        source VARCHAR(255) NOT NULL,
                        message TEXT NOT NULL,
                        stack_trace TEXT,
                        user_id VARCHAR(36),
                        session_id VARCHAR(36),
                        details JSONB
                    )
                """))
                conn.commit()
                logger.info("Successfully created error_logs table")

                # Create indexes for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp
                    ON error_logs (timestamp DESC)
                """))
                conn.commit()
                logger.info("Created index idx_error_logs_timestamp")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_error_logs_level
                    ON error_logs (level)
                """))
                conn.commit()
                logger.info("Created index idx_error_logs_level")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_error_logs_source
                    ON error_logs (source)
                """))
                conn.commit()
                logger.info("Created index idx_error_logs_source")

            except Exception as e:
                logger.error(f"Failed to create error_logs table: {e}")
                conn.rollback()
        else:
            logger.info("error_logs table already exists")

        # Create daily_plan_views table if it doesn't exist (per-user view tracking)
        if 'daily_plan_views' not in inspector.get_table_names():
            logger.info("Creating daily_plan_views table...")
            try:
                conn.execute(text("""
                    CREATE TABLE daily_plan_views (
                        id SERIAL PRIMARY KEY,
                        daily_plan_id INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT uq_daily_plan_user UNIQUE (daily_plan_id, user_id)
                    )
                """))
                conn.commit()
                logger.info("Successfully created daily_plan_views table")

                # Create indexes for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_daily_plan_views_plan
                    ON daily_plan_views (daily_plan_id)
                """))
                conn.commit()
                logger.info("Created index idx_daily_plan_views_plan")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_daily_plan_views_user
                    ON daily_plan_views (user_id)
                """))
                conn.commit()
                logger.info("Created index idx_daily_plan_views_user")

            except Exception as e:
                logger.error(f"Failed to create daily_plan_views table: {e}")
                conn.rollback()
        else:
            logger.info("daily_plan_views table already exists")

        # Create pending_invitations table if it doesn't exist (for inviting non-users)
        if 'pending_invitations' not in inspector.get_table_names():
            logger.info("Creating pending_invitations table...")
            try:
                conn.execute(text("""
                    CREATE TABLE pending_invitations (
                        id VARCHAR(43) PRIMARY KEY,
                        email VARCHAR(255) NOT NULL,
                        session_id VARCHAR(36) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                        invited_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token VARCHAR(43) UNIQUE NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created pending_invitations table")

                # Create indexes for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_pending_invitations_email
                    ON pending_invitations (email)
                """))
                conn.commit()
                logger.info("Created index idx_pending_invitations_email")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_pending_invitations_session
                    ON pending_invitations (session_id)
                """))
                conn.commit()
                logger.info("Created index idx_pending_invitations_session")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_pending_invitations_token
                    ON pending_invitations (token)
                """))
                conn.commit()
                logger.info("Created index idx_pending_invitations_token")

            except Exception as e:
                logger.error(f"Failed to create pending_invitations table: {e}")
                conn.rollback()
        else:
            logger.info("pending_invitations table already exists")

        # Check if journal_entries table exists and add source_document_id column
        if 'journal_entries' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('journal_entries')]

            # Add source_document_id column if it doesn't exist
            if 'source_document_id' not in columns:
                logger.info("Adding source_document_id column to journal_entries table...")
                try:
                    # Add the column as nullable
                    conn.execute(text("""
                        ALTER TABLE journal_entries
                        ADD COLUMN source_document_id INTEGER NULL
                    """))
                    conn.commit()
                    logger.info("Successfully added source_document_id column to journal_entries")

                    # Add foreign key constraint with ON DELETE CASCADE
                    conn.execute(text("""
                        ALTER TABLE journal_entries
                        ADD CONSTRAINT fk_journal_entries_document
                        FOREIGN KEY (source_document_id)
                        REFERENCES documents(id) ON DELETE CASCADE
                    """))
                    conn.commit()
                    logger.info("Successfully added foreign key constraint for source_document_id")

                    # Create index for efficient lookups by document
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_journal_entries_document
                        ON journal_entries (source_document_id)
                    """))
                    conn.commit()
                    logger.info("Created index idx_journal_entries_document")

                except Exception as e:
                    logger.error(f"Failed to add source_document_id column to journal_entries: {e}")
                    conn.rollback()
            else:
                logger.info("source_document_id column already exists in journal_entries")

            # Add source_audio_id column if it doesn't exist
            if 'source_audio_id' not in columns:
                logger.info("Adding source_audio_id column to journal_entries table...")
                try:
                    # Add the column as nullable
                    conn.execute(text("""
                        ALTER TABLE journal_entries
                        ADD COLUMN source_audio_id INTEGER NULL
                    """))
                    conn.commit()
                    logger.info("Successfully added source_audio_id column to journal_entries")

                    # Add foreign key constraint with ON DELETE CASCADE
                    conn.execute(text("""
                        ALTER TABLE journal_entries
                        ADD CONSTRAINT fk_journal_entries_audio
                        FOREIGN KEY (source_audio_id)
                        REFERENCES audio_recordings(id) ON DELETE CASCADE
                    """))
                    conn.commit()
                    logger.info("Successfully added foreign key constraint for source_audio_id")

                    # Create index for efficient lookups by audio recording
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_journal_entries_audio
                        ON journal_entries (source_audio_id)
                    """))
                    conn.commit()
                    logger.info("Created index idx_journal_entries_audio")

                except Exception as e:
                    logger.error(f"Failed to add source_audio_id column to journal_entries: {e}")
                    conn.rollback()
            else:
                logger.info("source_audio_id column already exists in journal_entries")

        # Check if conversations table exists and add audio_recording_id column
        if 'conversations' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('conversations')]

            # Add audio_recording_id column if it doesn't exist
            if 'audio_recording_id' not in columns:
                logger.info("Adding audio_recording_id column to conversations table...")
                try:
                    # Add the column as nullable
                    conn.execute(text("""
                        ALTER TABLE conversations
                        ADD COLUMN audio_recording_id INTEGER NULL
                    """))
                    conn.commit()
                    logger.info("Successfully added audio_recording_id column to conversations")

                    # Add foreign key constraint with ON DELETE SET NULL
                    conn.execute(text("""
                        ALTER TABLE conversations
                        ADD CONSTRAINT fk_conversations_audio
                        FOREIGN KEY (audio_recording_id)
                        REFERENCES audio_recordings(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Successfully added foreign key constraint for audio_recording_id")

                    # Create index for efficient lookups by audio recording
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_conversations_audio
                        ON conversations (audio_recording_id)
                    """))
                    conn.commit()
                    logger.info("Created index idx_conversations_audio")

                except Exception as e:
                    logger.error(f"Failed to add audio_recording_id column to conversations: {e}")
                    conn.rollback()
            else:
                logger.info("audio_recording_id column already exists in conversations")

        # Check if conversations table exists and add updated_at column
        if 'conversations' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('conversations')]

            # Add updated_at column if it doesn't exist
            if 'updated_at' not in columns:
                logger.info("Adding updated_at column to conversations table...")
                try:
                    # Add the column as nullable with no default
                    # It will only be set when a message is actually edited
                    conn.execute(text(
                        "ALTER TABLE conversations ADD COLUMN updated_at TIMESTAMP NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added updated_at column to conversations (nullable, no default)")

                except Exception as e:
                    logger.error(f"Failed to add updated_at column to conversations: {e}")
                    conn.rollback()
            else:
                logger.info("updated_at column already exists in conversations")

                # One-time fix: allow NULL and reset updated_at for unedited messages
                # Step 1: Make the column nullable if it isn't already
                try:
                    conn.execute(text(
                        "ALTER TABLE conversations ALTER COLUMN updated_at DROP NOT NULL"
                    ))
                    conn.commit()
                    logger.info("Made updated_at column nullable")
                except Exception as e:
                    # Column might already be nullable, that's okay
                    logger.info(f"Column already nullable or error dropping NOT NULL: {e}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass  # Rollback failure is acceptable

                # Step 2: Remove any DEFAULT value from updated_at column
                try:
                    # Drop any default value that might be set at the database level
                    conn.execute(text(
                        "ALTER TABLE conversations ALTER COLUMN updated_at DROP DEFAULT"
                    ))
                    conn.commit()
                    logger.info("Dropped DEFAULT from updated_at column")
                except Exception as e:
                    # Column might already have no default, that's okay
                    logger.info(f"updated_at column already has no default: {e}")
                    try:
                        conn.rollback()
                    except Exception:
                        pass  # Rollback failure is acceptable

                # Step 3: One-time reset of updated_at to NULL for all messages
                # The message editing feature is new, so any non-NULL updated_at values
                # are from automatic setting (database default/trigger), not real edits
                # This only runs once to clean up existing data
                migration_name = "reset_conversation_updated_at_v1"
                if not has_migration_run(conn, migration_name):
                    try:
                        result = conn.execute(text("""
                            UPDATE conversations
                            SET updated_at = NULL
                            WHERE updated_at IS NOT NULL
                        """))
                        conn.commit()
                        if result.rowcount > 0:
                            logger.info(f"Reset updated_at to NULL for {result.rowcount} messages (cleanup for new edit feature)")
                        else:
                            logger.info("No messages needed updating (all updated_at already NULL)")
                        mark_migration_complete(conn, migration_name)
                    except Exception as e:
                        logger.error(f"Failed to reset updated_at for messages: {e}")
                        try:
                            conn.rollback()
                        except Exception:
                            pass  # Rollback failure is acceptable
                else:
                    logger.info(f"Migration '{migration_name}' already applied, skipping")

        # Create api_logs table if it doesn't exist
        if 'api_logs' not in inspector.get_table_names():
            logger.info("Creating api_logs table...")
            try:
                conn.execute(text("""
                    CREATE TABLE api_logs (
                        id SERIAL PRIMARY KEY,
                        feature VARCHAR(50) NOT NULL,
                        input_tokens INTEGER NOT NULL DEFAULT 0,
                        output_tokens INTEGER NOT NULL DEFAULT 0,
                        success BOOLEAN NOT NULL DEFAULT TRUE,
                        error_message TEXT,
                        model VARCHAR(50),
                        response_time_ms INTEGER,
                        user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created api_logs table")

                # Create indexes for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_api_logs_feature
                    ON api_logs (feature)
                """))
                conn.commit()
                logger.info("Created index idx_api_logs_feature")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_api_logs_created_at
                    ON api_logs (created_at)
                """))
                conn.commit()
                logger.info("Created index idx_api_logs_created_at")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_api_logs_user_id
                    ON api_logs (user_id)
                """))
                conn.commit()
                logger.info("Created index idx_api_logs_user_id")

            except Exception as e:
                logger.error(f"Failed to create api_logs table: {e}")
                conn.rollback()
        else:
            logger.info("api_logs table already exists")

            # Add response_time_ms and user_id columns if they don't exist
            api_logs_columns = [col['name'] for col in inspector.get_columns('api_logs')]

            if 'response_time_ms' not in api_logs_columns:
                logger.info("Adding response_time_ms column to api_logs table...")
                try:
                    conn.execute(text("""
                        ALTER TABLE api_logs
                        ADD COLUMN response_time_ms INTEGER
                    """))
                    conn.commit()
                    logger.info("Successfully added response_time_ms column to api_logs")
                except Exception as e:
                    logger.error(f"Failed to add response_time_ms column: {e}")
                    conn.rollback()
            else:
                logger.info("response_time_ms column already exists in api_logs")

            if 'user_id' not in api_logs_columns:
                logger.info("Adding user_id column to api_logs table...")
                try:
                    conn.execute(text("""
                        ALTER TABLE api_logs
                        ADD COLUMN user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Successfully added user_id column to api_logs")

                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_api_logs_user_id
                        ON api_logs (user_id)
                    """))
                    conn.commit()
                    logger.info("Created index idx_api_logs_user_id")
                except Exception as e:
                    logger.error(f"Failed to add user_id column: {e}")
                    conn.rollback()
            else:
                logger.info("user_id column already exists in api_logs")

        # ==========================================
        # PROFILE TABLE
        # ==========================================

        # Create profiles table if it doesn't exist
        if 'profiles' not in inspector.get_table_names():
            logger.info("Creating profiles table...")
            try:
                conn.execute(text("""
                    CREATE TABLE profiles (
                        id SERIAL PRIMARY KEY,
                        session_id VARCHAR(36) NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
                        profile_data JSONB NOT NULL DEFAULT '{}',
                        pending_changes JSONB DEFAULT '[]',
                        last_ai_update TIMESTAMP NULL,
                        last_user_update TIMESTAMP NULL,
                        last_processed_conversation_id INTEGER NULL,
                        last_processed_journal_id INTEGER NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created profiles table")

                # Create index for session lookups
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_profiles_session
                    ON profiles (session_id)
                """))
                conn.commit()
                logger.info("Created index idx_profiles_session")

            except Exception as e:
                logger.error(f"Failed to create profiles table: {e}")
                conn.rollback()
        else:
            logger.info("profiles table already exists")

        # ==========================================
        # REFRESH TOKENS TABLE
        # ==========================================

        # Create refresh_tokens table if it doesn't exist
        if 'refresh_tokens' not in inspector.get_table_names():
            logger.info("Creating refresh_tokens table...")
            try:
                conn.execute(text("""
                    CREATE TABLE refresh_tokens (
                        id SERIAL PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token VARCHAR(255) NOT NULL UNIQUE,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        expires_at TIMESTAMP NOT NULL,
                        last_used_at TIMESTAMP NULL,
                        is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
                        revoked_at TIMESTAMP NULL,
                        device_info VARCHAR(500) NULL,
                        ip_address VARCHAR(45) NULL
                    )
                """))
                conn.commit()
                logger.info("Successfully created refresh_tokens table")

                # Create indexes for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
                    ON refresh_tokens (user_id)
                """))
                conn.commit()
                logger.info("Created index idx_refresh_tokens_user")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token
                    ON refresh_tokens (token)
                """))
                conn.commit()
                logger.info("Created index idx_refresh_tokens_token")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
                    ON refresh_tokens (expires_at)
                """))
                conn.commit()
                logger.info("Created index idx_refresh_tokens_expires")

            except Exception as e:
                logger.error(f"Failed to create refresh_tokens table: {e}")
                conn.rollback()
        else:
            logger.info("refresh_tokens table already exists")

        # =================================================================
        # Add unique constraint on daily_plans (session_id, date)
        # This prevents duplicate daily plans for the same session and date
        # =================================================================
        migration_name = "add_daily_plans_unique_constraint"
        if not has_migration_run(conn, migration_name):
            logger.info("Adding unique constraint to daily_plans table...")
            try:
                # First, remove any duplicate plans (keep the oldest one per session/date)
                # Also delete associated daily_plan_views to avoid FK constraint issues
                result = conn.execute(text("""
                    WITH duplicates AS (
                        SELECT id
                        FROM daily_plans
                        WHERE id NOT IN (
                            SELECT MIN(id)
                            FROM daily_plans
                            GROUP BY session_id, date
                        )
                    )
                    DELETE FROM daily_plan_views
                    WHERE daily_plan_id IN (SELECT id FROM duplicates)
                """))
                conn.commit()

                result = conn.execute(text("""
                    DELETE FROM daily_plans
                    WHERE id NOT IN (
                        SELECT MIN(id)
                        FROM daily_plans
                        GROUP BY session_id, date
                    )
                """))
                deleted_count = result.rowcount
                conn.commit()
                if deleted_count > 0:
                    logger.info(f"Removed {deleted_count} duplicate daily plans")

                # Now add the unique constraint
                conn.execute(text("""
                    ALTER TABLE daily_plans
                    ADD CONSTRAINT uq_daily_plan_session_date UNIQUE (session_id, date)
                """))
                conn.commit()
                logger.info("Successfully added unique constraint to daily_plans")

                mark_migration_complete(conn, migration_name)

            except Exception as e:
                # Constraint might already exist
                if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                    conn.rollback()
                    logger.info("Unique constraint on daily_plans already exists")
                    mark_migration_complete(conn, migration_name)
                else:
                    logger.error(f"Failed to add unique constraint to daily_plans: {e}")
                    conn.rollback()

        # =================================================================
        # Add email verification columns to users table
        # For new user registration email verification (hard verification)
        # =================================================================
        migration_name = "add_email_verification_columns"
        if not has_migration_run(conn, migration_name):
            logger.info("Adding email verification columns to users table...")
            try:
                # Get current columns
                result = conn.execute(text("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'users'
                """))
                columns = [row[0] for row in result]

                # Add is_email_verified column (default True for existing users)
                if 'is_email_verified' not in columns:
                    conn.execute(text("""
                        ALTER TABLE users
                        ADD COLUMN is_email_verified BOOLEAN NOT NULL DEFAULT TRUE
                    """))
                    conn.commit()
                    logger.info("Added is_email_verified column to users table")

                # Add email_verification_token column
                if 'email_verification_token' not in columns:
                    conn.execute(text("""
                        ALTER TABLE users
                        ADD COLUMN email_verification_token VARCHAR
                    """))
                    conn.commit()
                    logger.info("Added email_verification_token column to users table")

                # Add email_verification_token_expires column
                if 'email_verification_token_expires' not in columns:
                    conn.execute(text("""
                        ALTER TABLE users
                        ADD COLUMN email_verification_token_expires TIMESTAMP
                    """))
                    conn.commit()
                    logger.info("Added email_verification_token_expires column to users table")

                # Add partial index on email_verification_token for faster lookups
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
                    ON users(email_verification_token)
                    WHERE email_verification_token IS NOT NULL
                """))
                conn.commit()
                logger.info("Added index on email_verification_token")

                mark_migration_complete(conn, migration_name)
                logger.info("Successfully added email verification columns")

            except Exception as e:
                logger.error(f"Failed to add email verification columns: {e}")
                conn.rollback()

        # =================================================================
        # Add unique constraint on pending_invitations (email, session_id)
        # This prevents duplicate invitations via race conditions
        # =================================================================
        migration_name = "add_pending_invitations_unique_constraint"
        if not has_migration_run(conn, migration_name):
            logger.info("Adding unique constraint to pending_invitations table...")
            try:
                # First, remove any duplicate invitations (keep the newest one per email/session)
                result = conn.execute(text("""
                    DELETE FROM pending_invitations
                    WHERE id NOT IN (
                        SELECT id FROM (
                            SELECT DISTINCT ON (email, session_id) id
                            FROM pending_invitations
                            ORDER BY email, session_id, created_at DESC
                        ) AS newest
                    )
                """))
                deleted_count = result.rowcount
                conn.commit()
                if deleted_count > 0:
                    logger.info(f"Removed {deleted_count} duplicate pending invitations")

                # Now add the unique constraint
                conn.execute(text("""
                    ALTER TABLE pending_invitations
                    ADD CONSTRAINT uq_pending_invitation_email_session UNIQUE (email, session_id)
                """))
                conn.commit()
                logger.info("Successfully added unique constraint to pending_invitations")

                mark_migration_complete(conn, migration_name)

            except Exception as e:
                # Constraint might already exist
                if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                    conn.rollback()
                    logger.info("Unique constraint on pending_invitations already exists")
                    mark_migration_complete(conn, migration_name)
                else:
                    logger.error(f"Failed to add unique constraint to pending_invitations: {e}")
                    conn.rollback()

        # ==========================================
        # ADMIN REPORTS TABLE
        # ==========================================

        # Create admin_reports table if it doesn't exist
        if 'admin_reports' not in inspector.get_table_names():
            logger.info("Creating admin_reports table...")
            try:
                conn.execute(text("""
                    CREATE TABLE admin_reports (
                        id SERIAL PRIMARY KEY,
                        date DATE NOT NULL UNIQUE,
                        content TEXT NOT NULL,
                        has_concerns BOOLEAN NOT NULL DEFAULT FALSE,
                        security_log_count INTEGER NOT NULL DEFAULT 0,
                        error_log_count INTEGER NOT NULL DEFAULT 0,
                        api_log_count INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created admin_reports table")

                # Create index on date for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_admin_reports_date
                    ON admin_reports (date DESC)
                """))
                conn.commit()
                logger.info("Created index idx_admin_reports_date")

            except Exception as e:
                logger.error(f"Failed to create admin_reports table: {e}")
                conn.rollback()
        else:
            logger.info("admin_reports table already exists")

        # ==========================================
        # WAITLIST TABLE
        # ==========================================

        # Create waitlist table if it doesn't exist
        if 'waitlist' not in inspector.get_table_names():
            logger.info("Creating waitlist table...")
            try:
                conn.execute(text("""
                    CREATE TABLE waitlist (
                        id VARCHAR(43) PRIMARY KEY,
                        email VARCHAR(255) NOT NULL UNIQUE,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        invited_at TIMESTAMP NULL,
                        invitation_token VARCHAR(43) UNIQUE NULL,
                        invitation_expires TIMESTAMP NULL,
                        notes TEXT NULL,
                        added_by_email VARCHAR(255) NULL,
                        referrers JSONB NULL,
                        user_message TEXT NULL
                    )
                """))
                conn.commit()
                logger.info("Successfully created waitlist table")

                # Create indexes for efficient queries
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_waitlist_email
                    ON waitlist (email)
                """))
                conn.commit()
                logger.info("Created index idx_waitlist_email")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_waitlist_invitation_token
                    ON waitlist (invitation_token)
                    WHERE invitation_token IS NOT NULL
                """))
                conn.commit()
                logger.info("Created index idx_waitlist_invitation_token")

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_waitlist_created_at
                    ON waitlist (created_at DESC)
                """))
                conn.commit()
                logger.info("Created index idx_waitlist_created_at")

            except Exception as e:
                logger.error(f"Failed to create waitlist table: {e}")
                conn.rollback()
        else:
            logger.info("waitlist table already exists")

        # Add user_message column to waitlist table if it doesn't exist
        if 'waitlist' in inspector.get_table_names():
            waitlist_columns = [col['name'] for col in inspector.get_columns('waitlist')]
            if 'user_message' not in waitlist_columns:
                logger.info("Adding user_message column to waitlist table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE waitlist ADD COLUMN user_message TEXT NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added user_message column to waitlist")
                except Exception as e:
                    logger.error(f"Failed to add user_message column to waitlist: {e}")
                    conn.rollback()
            else:
                logger.info("user_message column already exists in waitlist")

        # ==========================================
        # MFA (Multi-Factor Authentication) TABLES
        # ==========================================

        # Add MFA columns to users table
        if 'users' in inspector.get_table_names():
            user_columns = [col['name'] for col in inspector.get_columns('users')]

            if 'mfa_enabled' not in user_columns:
                logger.info("Adding mfa_enabled column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE"
                    ))
                    conn.commit()
                    logger.info("Successfully added mfa_enabled column to users")
                except Exception as e:
                    logger.error(f"Failed to add mfa_enabled column: {e}")
                    conn.rollback()
            else:
                logger.info("mfa_enabled column already exists in users")

            if 'mfa_preferred_method' not in user_columns:
                logger.info("Adding mfa_preferred_method column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN mfa_preferred_method VARCHAR(20) NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added mfa_preferred_method column to users")
                except Exception as e:
                    logger.error(f"Failed to add mfa_preferred_method column: {e}")
                    conn.rollback()
            else:
                logger.info("mfa_preferred_method column already exists in users")

            if 'mfa_enabled_at' not in user_columns:
                logger.info("Adding mfa_enabled_at column to users table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE users ADD COLUMN mfa_enabled_at TIMESTAMP NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added mfa_enabled_at column to users")
                except Exception as e:
                    logger.error(f"Failed to add mfa_enabled_at column: {e}")
                    conn.rollback()
            else:
                logger.info("mfa_enabled_at column already exists in users")

        # Create user_passkeys table for WebAuthn credentials
        if 'user_passkeys' not in inspector.get_table_names():
            logger.info("Creating user_passkeys table...")
            try:
                conn.execute(text("""
                    CREATE TABLE user_passkeys (
                        id VARCHAR(43) PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        credential_id BYTEA NOT NULL UNIQUE,
                        public_key BYTEA NOT NULL,
                        counter INTEGER NOT NULL DEFAULT 0,
                        device_name VARCHAR(100) NOT NULL,
                        transports VARCHAR(255) NULL,
                        backed_up BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        last_used_at TIMESTAMP NULL
                    )
                """))
                conn.commit()
                logger.info("Successfully created user_passkeys table")

                # Create indexes
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_user_passkeys_user
                    ON user_passkeys (user_id)
                """))
                conn.commit()

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential
                    ON user_passkeys (credential_id)
                """))
                conn.commit()
                logger.info("Created indexes for user_passkeys table")

            except Exception as e:
                logger.error(f"Failed to create user_passkeys table: {e}")
                conn.rollback()
        else:
            logger.info("user_passkeys table already exists")

        # Create user_totp_secrets table for TOTP authentication
        if 'user_totp_secrets' not in inspector.get_table_names():
            logger.info("Creating user_totp_secrets table...")
            try:
                conn.execute(text("""
                    CREATE TABLE user_totp_secrets (
                        id VARCHAR(43) PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                        secret_encrypted VARCHAR(255) NOT NULL,
                        verified BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        last_used_at TIMESTAMP NULL
                    )
                """))
                conn.commit()
                logger.info("Successfully created user_totp_secrets table")

                # Create index
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_user_totp_secrets_user
                    ON user_totp_secrets (user_id)
                """))
                conn.commit()
                logger.info("Created index for user_totp_secrets table")

            except Exception as e:
                logger.error(f"Failed to create user_totp_secrets table: {e}")
                conn.rollback()
        else:
            logger.info("user_totp_secrets table already exists")

        # Create user_backup_codes table for recovery codes
        if 'user_backup_codes' not in inspector.get_table_names():
            logger.info("Creating user_backup_codes table...")
            try:
                conn.execute(text("""
                    CREATE TABLE user_backup_codes (
                        id VARCHAR(43) PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        code_hash VARCHAR(255) NOT NULL,
                        used_at TIMESTAMP NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created user_backup_codes table")

                # Create indexes
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user
                    ON user_backup_codes (user_id)
                """))
                conn.commit()

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_user_backup_codes_unused
                    ON user_backup_codes (user_id) WHERE used_at IS NULL
                """))
                conn.commit()
                logger.info("Created indexes for user_backup_codes table")

            except Exception as e:
                logger.error(f"Failed to create user_backup_codes table: {e}")
                conn.rollback()
        else:
            logger.info("user_backup_codes table already exists")

        # Create trusted_devices table for MFA device trust
        if 'trusted_devices' not in inspector.get_table_names():
            logger.info("Creating trusted_devices table...")
            try:
                conn.execute(text("""
                    CREATE TABLE trusted_devices (
                        id VARCHAR(43) PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        device_token_hash VARCHAR(255) NOT NULL UNIQUE,
                        device_name VARCHAR(255) NULL,
                        ip_address VARCHAR(45) NULL,
                        trusted_until TIMESTAMP NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        last_used_at TIMESTAMP NULL
                    )
                """))
                conn.commit()
                logger.info("Successfully created trusted_devices table")

                # Create indexes
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_trusted_devices_user
                    ON trusted_devices (user_id)
                """))
                conn.commit()

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_trusted_devices_token
                    ON trusted_devices (device_token_hash)
                """))
                conn.commit()

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_trusted_devices_expires
                    ON trusted_devices (trusted_until)
                """))
                conn.commit()
                logger.info("Created indexes for trusted_devices table")

            except Exception as e:
                logger.error(f"Failed to create trusted_devices table: {e}")
                conn.rollback()
        else:
            logger.info("trusted_devices table already exists")

        # Create mfa_challenges table for temporary challenge storage
        if 'mfa_challenges' not in inspector.get_table_names():
            logger.info("Creating mfa_challenges table...")
            try:
                conn.execute(text("""
                    CREATE TABLE mfa_challenges (
                        id VARCHAR(43) PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        challenge_type VARCHAR(20) NOT NULL,
                        challenge_data BYTEA NOT NULL,
                        expires_at TIMESTAMP NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()
                logger.info("Successfully created mfa_challenges table")

                # Create indexes
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user
                    ON mfa_challenges (user_id)
                """))
                conn.commit()

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires
                    ON mfa_challenges (expires_at)
                """))
                conn.commit()
                logger.info("Created indexes for mfa_challenges table")

            except Exception as e:
                logger.error(f"Failed to create mfa_challenges table: {e}")
                conn.rollback()
        else:
            logger.info("mfa_challenges table already exists")

        # Add last_used_counter column to user_totp_secrets for replay protection
        if 'user_totp_secrets' in inspector.get_table_names():
            totp_columns = [col['name'] for col in inspector.get_columns('user_totp_secrets')]

            if 'last_used_counter' not in totp_columns:
                logger.info("Adding last_used_counter column to user_totp_secrets table...")
                try:
                    conn.execute(text(
                        "ALTER TABLE user_totp_secrets ADD COLUMN last_used_counter BIGINT NULL"
                    ))
                    conn.commit()
                    logger.info("Successfully added last_used_counter column to user_totp_secrets")
                except Exception as e:
                    logger.error(f"Failed to add last_used_counter column: {e}")
                    conn.rollback()
            else:
                logger.info("last_used_counter column already exists in user_totp_secrets")

        # =================================================================
        # Add source tracking columns for collaborative sessions
        # These columns track who created/edited items for attribution display
        # =================================================================
        migration_name = "add_source_tracking_columns"
        if not has_migration_run(conn, migration_name):
            logger.info("Adding source tracking columns for collaborative sessions...")
            try:
                # Add columns to conversations table
                conversations_columns = [col['name'] for col in inspector.get_columns('conversations')]

                if 'created_by_user_id' not in conversations_columns:
                    conn.execute(text("""
                        ALTER TABLE conversations
                        ADD COLUMN created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Added created_by_user_id column to conversations")

                if 'last_edited_by_user_id' not in conversations_columns:
                    conn.execute(text("""
                        ALTER TABLE conversations
                        ADD COLUMN last_edited_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Added last_edited_by_user_id column to conversations")

                # Add columns to documents table
                documents_columns = [col['name'] for col in inspector.get_columns('documents')]

                if 'uploaded_by_user_id' not in documents_columns:
                    conn.execute(text("""
                        ALTER TABLE documents
                        ADD COLUMN uploaded_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Added uploaded_by_user_id column to documents")

                if 'last_edited_by_user_id' not in documents_columns:
                    conn.execute(text("""
                        ALTER TABLE documents
                        ADD COLUMN last_edited_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Added last_edited_by_user_id column to documents")

                # Add columns to audio_recordings table
                audio_columns = [col['name'] for col in inspector.get_columns('audio_recordings')]

                if 'created_by_user_id' not in audio_columns:
                    conn.execute(text("""
                        ALTER TABLE audio_recordings
                        ADD COLUMN created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Added created_by_user_id column to audio_recordings")

                if 'last_edited_by_user_id' not in audio_columns:
                    conn.execute(text("""
                        ALTER TABLE audio_recordings
                        ADD COLUMN last_edited_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Added last_edited_by_user_id column to audio_recordings")

                # Create indexes for efficient joins
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_conversations_created_by
                    ON conversations (created_by_user_id) WHERE created_by_user_id IS NOT NULL
                """))
                conn.commit()

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
                    ON documents (uploaded_by_user_id) WHERE uploaded_by_user_id IS NOT NULL
                """))
                conn.commit()

                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_audio_recordings_created_by
                    ON audio_recordings (created_by_user_id) WHERE created_by_user_id IS NOT NULL
                """))
                conn.commit()
                logger.info("Created indexes for source tracking columns")

                mark_migration_complete(conn, migration_name)
                logger.info("Successfully added source tracking columns for collaborative sessions")

            except Exception as e:
                logger.error(f"Failed to add source tracking columns: {e}")
                conn.rollback()

        # =================================================================
        # Add last_edited_by_user_id column to journal_entries
        # =================================================================
        migration_name = "add_journal_last_edited_by"
        if not has_migration_run(conn, migration_name):
            logger.info("Adding last_edited_by_user_id column to journal_entries...")
            try:
                journal_columns = [col['name'] for col in inspector.get_columns('journal_entries')]

                if 'last_edited_by_user_id' not in journal_columns:
                    conn.execute(text("""
                        ALTER TABLE journal_entries
                        ADD COLUMN last_edited_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    logger.info("Added last_edited_by_user_id column to journal_entries")

                mark_migration_complete(conn, migration_name)
                logger.info("Successfully added journal entry source tracking column")

            except Exception as e:
                logger.error(f"Failed to add journal last_edited_by column: {e}")
                conn.rollback()

        # =================================================================
        # CONSENT RECORDS TABLE
        # =================================================================

        # Create consent_records table if it doesn't exist
        if 'consent_records' not in inspector.get_table_names():
            logger.info("Creating consent_records table...")
            try:
                conn.execute(text("""
                    CREATE TABLE consent_records (
                        id SERIAL PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        consent_type VARCHAR(50) NOT NULL,
                        consent_version VARCHAR(20) NOT NULL,
                        consent_text TEXT NOT NULL,
                        ip_address VARCHAR(45),
                        user_agent VARCHAR(500),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        session_id VARCHAR(36) REFERENCES sessions(id) ON DELETE SET NULL,
                        shared_with_email VARCHAR(255)
                    )
                """))
                conn.commit()
                logger.info("Successfully created consent_records table")

                # Create indexes
                conn.execute(text("""
                    CREATE INDEX idx_consent_records_user_id ON consent_records (user_id);
                    CREATE INDEX idx_consent_records_consent_type ON consent_records (consent_type);
                    CREATE INDEX idx_consent_records_created_at ON consent_records (created_at);
                    CREATE INDEX idx_consent_records_session_id ON consent_records (session_id) WHERE session_id IS NOT NULL;
                """))
                conn.commit()
                logger.info("Created indexes for consent_records table")

            except Exception as e:
                logger.error(f"Failed to create consent_records table: {e}")
                conn.rollback()
        else:
            logger.info("consent_records table already exists")

            # Add session_id and shared_with_email columns if they don't exist (for existing deployments)
            consent_columns = [col['name'] for col in inspector.get_columns('consent_records')]

            if 'session_id' not in consent_columns:
                logger.info("Adding session_id column to consent_records table...")
                try:
                    conn.execute(text("""
                        ALTER TABLE consent_records
                        ADD COLUMN session_id VARCHAR(36) REFERENCES sessions(id) ON DELETE SET NULL
                    """))
                    conn.commit()
                    conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_consent_records_session_id
                        ON consent_records (session_id) WHERE session_id IS NOT NULL
                    """))
                    conn.commit()
                    logger.info("Successfully added session_id column")
                except Exception as e:
                    logger.error(f"Failed to add session_id column: {e}")
                    conn.rollback()

            if 'shared_with_email' not in consent_columns:
                logger.info("Adding shared_with_email column to consent_records table...")
                try:
                    conn.execute(text("""
                        ALTER TABLE consent_records
                        ADD COLUMN shared_with_email VARCHAR(255)
                    """))
                    conn.commit()
                    logger.info("Successfully added shared_with_email column")
                except Exception as e:
                    logger.error(f"Failed to add shared_with_email column: {e}")
                    conn.rollback()

            # Migrate consent_type from PostgreSQL native enum to VARCHAR if needed
            # (Only affects deployments where SQLAlchemy created table with native enum)
            try:
                result = conn.execute(text("""
                    SELECT data_type, udt_name FROM information_schema.columns
                    WHERE table_name = 'consent_records' AND column_name = 'consent_type'
                """))
                row = result.fetchone()

                if row and row[0] == 'USER-DEFINED' and row[1] == 'consenttype':
                    logger.info("Converting consent_type from native enum to VARCHAR...")
                    conn.execute(text("ALTER TABLE consent_records ADD COLUMN consent_type_new VARCHAR(50)"))
                    conn.commit()
                    conn.execute(text("UPDATE consent_records SET consent_type_new = consent_type::text"))
                    conn.commit()
                    conn.execute(text("ALTER TABLE consent_records DROP COLUMN consent_type"))
                    conn.commit()
                    conn.execute(text("ALTER TABLE consent_records RENAME COLUMN consent_type_new TO consent_type"))
                    conn.commit()
                    conn.execute(text("ALTER TABLE consent_records ALTER COLUMN consent_type SET NOT NULL"))
                    conn.commit()
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_consent_records_consent_type ON consent_records (consent_type)"))
                    conn.commit()
                    conn.execute(text("DROP TYPE IF EXISTS consenttype"))
                    conn.commit()
                    logger.info("Successfully converted consent_type to VARCHAR")
            except Exception as e:
                logger.error(f"Failed to migrate consent_type to VARCHAR: {e}")
                conn.rollback()

        # ==========================================
        # USER SESSION COLORS TABLE
        # ==========================================

        # Create user_session_colors table if it doesn't exist
        if 'user_session_colors' not in inspector.get_table_names():
            logger.info("Creating user_session_colors table...")
            try:
                conn.execute(text("""
                    CREATE TABLE user_session_colors (
                        id VARCHAR(36) PRIMARY KEY,
                        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        session_id VARCHAR(36) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                        color_key VARCHAR(30) NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT uq_user_session_color UNIQUE (user_id, session_id)
                    )
                """))
                conn.commit()
                logger.info("Successfully created user_session_colors table")

                # Create index for efficient lookups by user
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_user_session_colors_user_id
                    ON user_session_colors (user_id)
                """))
                conn.commit()
                logger.info("Created index idx_user_session_colors_user_id")

            except Exception as e:
                logger.error(f"Failed to create user_session_colors table: {e}")
                conn.rollback()
        else:
            logger.info("user_session_colors table already exists")

        # ==========================================
        # JOURNAL ENTRY EMBEDDINGS (pgvector)
        # ==========================================

        # Enable pgvector extension (idempotent)
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
            logger.info("pgvector extension enabled")
        except Exception as e:
            logger.error(f"Failed to enable pgvector extension: {e}")
            conn.rollback()

        # Create journal_entry_embeddings table
        if 'journal_entry_embeddings' not in inspector.get_table_names():
            logger.info("Creating journal_entry_embeddings table...")
            try:
                conn.execute(text("""
                    CREATE TABLE journal_entry_embeddings (
                        id SERIAL PRIMARY KEY,
                        journal_entry_id INTEGER NOT NULL UNIQUE,
                        session_id VARCHAR NOT NULL,
                        embedding vector(1536) NOT NULL,
                        embedding_model VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
                        content_hash VARCHAR(64) NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_embedding_journal_entry
                            FOREIGN KEY (journal_entry_id)
                            REFERENCES journal_entries(id) ON DELETE CASCADE,
                        CONSTRAINT fk_embedding_session
                            FOREIGN KEY (session_id)
                            REFERENCES sessions(id) ON DELETE CASCADE
                    )
                """))
                conn.commit()
                logger.info("Successfully created journal_entry_embeddings table")

                # Index for session-scoped queries
                conn.execute(text("""
                    CREATE INDEX idx_journal_embeddings_session
                    ON journal_entry_embeddings (session_id)
                """))
                conn.commit()

                # HNSW index for fast approximate nearest neighbor search
                conn.execute(text("""
                    CREATE INDEX idx_journal_embeddings_hnsw
                    ON journal_entry_embeddings
                    USING hnsw (embedding vector_cosine_ops)
                    WITH (m = 16, ef_construction = 64)
                """))
                conn.commit()
                logger.info("Created indexes for journal_entry_embeddings")

            except Exception as e:
                logger.error(f"Failed to create journal_entry_embeddings table: {e}")
                conn.rollback()
        else:
            logger.info("journal_entry_embeddings table already exists")

        # ==========================================
        # FK INDEXES FOR QUERY PERFORMANCE
        # ==========================================
        # Many FK columns lacked indexes, causing full table scans.
        # Composite indexes (e.g. idx_conversations_session_created) already
        # cover leftmost-column lookups, and source-tracking migrations already
        # created partial indexes. This migration adds the remaining ones.
        migration_name = "add_fk_indexes"
        if not has_migration_run(conn, migration_name):
            logger.info("Adding missing FK indexes...")
            fk_indexes = [
                ("ix_sessions_user_id", "sessions", "user_id"),
                ("ix_sessions_owner_id", "sessions", "owner_id"),
                ("ix_admin_audit_logs_admin_user", "admin_audit_logs", "admin_user_id"),
                ("ix_pending_invitations_invited_by", "pending_invitations", "invited_by_user_id"),
            ]
            for idx_name, table, column in fk_indexes:
                if table in inspector.get_table_names():
                    try:
                        conn.execute(text(
                            f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({column})"
                        ))
                        conn.commit()
                        logger.info(f"Created index {idx_name}")
                    except Exception as e:
                        logger.warning(f"Failed to create index {idx_name}: {e}")
                        conn.rollback()
            mark_migration_complete(conn, migration_name)

        # ==========================================
        # DEVICE TOKENS TABLE (Push Notifications)
        # ==========================================
        migration_name = "create_device_tokens_table"
        if not has_migration_run(conn, migration_name):
            logger.info("Running migration: create_device_tokens_table")
            try:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS device_tokens (
                        id VARCHAR PRIMARY KEY,
                        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token VARCHAR NOT NULL,
                        platform VARCHAR(10) NOT NULL DEFAULT 'ios',
                        app_version VARCHAR(20),
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        last_used_at TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id)"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token)"
                ))
                conn.commit()
                mark_migration_complete(conn, migration_name)
                logger.info("Created device_tokens table")
            except Exception as e:
                logger.error(f"Failed to create device_tokens table: {e}")
                conn.rollback()

        # =================================================================
        # TRIGRAM INDEXES FOR AUDIO RECORDING TEXT SEARCH
        # =================================================================
        migration_name = "add_audio_trigram_indexes"
        if not has_migration_run(conn, migration_name):
            logger.info("Adding trigram indexes for audio recording text search...")
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                conn.commit()
                conn.execute(text(
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audio_summary_trgm "
                    "ON audio_recordings USING gin (ai_summary gin_trgm_ops)"
                ))
                conn.commit()
                conn.execute(text(
                    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audio_text_trgm "
                    "ON audio_recordings USING gin (transcribed_text gin_trgm_ops)"
                ))
                conn.commit()
                mark_migration_complete(conn, migration_name)
                logger.info("Successfully added trigram indexes for audio recording search")
            except Exception as e:
                logger.error(f"Failed to add trigram indexes: {e}")
                conn.rollback()
