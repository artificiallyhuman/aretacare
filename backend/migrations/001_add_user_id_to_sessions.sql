-- Migration: Add user_id column to sessions table
-- Date: 2025-11-26
-- Description: Adds user_id foreign key to sessions table for authentication system

-- Step 1: Delete all existing sessions (they're from pre-auth system)
DELETE FROM sessions;

-- Step 2: Add user_id column with foreign key constraint
ALTER TABLE sessions
ADD COLUMN user_id VARCHAR NOT NULL
REFERENCES users(id) ON DELETE CASCADE;

-- Step 3: Create index on user_id for better performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
