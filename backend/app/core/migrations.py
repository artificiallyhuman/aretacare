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
