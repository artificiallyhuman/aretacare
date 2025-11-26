# Database Migrations

This directory contains SQL migration scripts for database schema changes.

## Running Migrations on Render

### Method 1: Using Render Shell

1. Go to your Render dashboard
2. Navigate to the `aretacare-backend` service
3. Click "Shell" tab
4. Connect to the database:
   ```bash
   psql $DATABASE_URL
   ```
5. Run the migration:
   ```sql
   \i /app/backend/migrations/001_add_user_id_to_sessions.sql
   ```
   Or copy-paste the SQL commands directly

### Method 2: Using psql from local machine

1. Get your DATABASE_URL from Render dashboard (Environment tab)
2. Run from your local machine:
   ```bash
   psql "your-database-url-here" < backend/migrations/001_add_user_id_to_sessions.sql
   ```

### Method 3: Using Render Dashboard SQL Query

1. Go to your Render dashboard
2. Navigate to the `aretacare-db` database service
3. Click "Info" tab, then "Connect" dropdown
4. Click "SQL Query"
5. Copy-paste the migration SQL and execute

## Migration History

- `001_add_user_id_to_sessions.sql` - Adds user_id foreign key to sessions table for authentication system (2025-11-26)
