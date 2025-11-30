# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AretaCare is an AI-powered medical care advocate assistant that helps families understand complex medical information. It maintains **strict safety boundaries** - never diagnosing, recommending treatments, or predicting outcomes. The core function is to translate medical jargon, summarize clinical notes, and help families prepare questions for healthcare teams.

**Key Features:**
- Conversation-first interface with AI care advocate, "Thinking..." status, enhanced markdown rendering
- Multi-session support (up to 3 sessions per user, including collaborations) with session switcher, rename (15-char limit), and separate data per session
- Session sharing - share sessions with up to 4 collaborators (5 people total), collaborators have full access to session data
- Daily Plan - AI-generated summaries, user editable, delete and regenerate capability
- AI Journal Synthesis - extracts medical updates from conversations with local timezone support
- Journal with date navigation - reverse chronological, sticky sidebar, scroll-to-date functionality
- GPT-5.1 native file support for PDFs and images via Responses API
- Audio recording with live waveform visualization and real-time transcription
- JWT-based authentication with bcrypt password hashing, registration requires three acknowledgement checkboxes
- Email notifications - password changes, email changes, collaborator management (sent via Gmail SMTP)
- Settings page - account management, password reset via email, manage sessions, account deletion
- AI-powered Documents Manager (12 categories, AI descriptions, searchable, date navigation)
- AI-powered Audio Recordings (12 categories, AI summaries, searchable, date navigation)
- Complete data deletion - removes PostgreSQL data and S3 files (zero orphaned files)
- Admin console - user metrics, system health, S3 orphan cleanup, audit logging with GDPR retention
- Mobile-optimized design with responsive layouts
- Dark mode support via Tailwind CSS and ThemeContext
- Specialized tools: Jargon Translator, Conversation Coach

## Development Commands

```bash
docker compose up --build          # Start all services
docker compose down                # Stop services
docker compose down -v             # Stop and reset database
docker compose logs -f backend     # Follow backend logs
docker compose restart backend     # Restart backend
python -c "import secrets; print(secrets.token_urlsafe(32))"  # Generate secret key
```

## Architecture Overview

### Multi-Service Application

**Backend (FastAPI)**
- Lives in `backend/app/`
- Auto-creates database tables on startup via SQLAlchemy
- API routes mounted at `/api` prefix
- All routes return JSON, documented at `/docs`
- JWT-based authentication with Bearer token in Authorization header
- Password hashing with bcrypt (version <5.0.0 for passlib compatibility)

**Frontend (React + Vite)**
- Lives in `frontend/src/`
- Uses **relative API URLs** (`/api`) to leverage Vite's proxy in Docker
- Session management via `SessionContext` manages multiple sessions, active session ID stored in localStorage
- **User authentication** with JWT tokens stored in localStorage
- Auth token automatically included in API requests via axios interceptor
- Protected routes redirect to login if not authenticated

**Database (PostgreSQL)**
- Nine main tables: `users`, `sessions`, `session_collaborators`, `documents`, `audio_recordings`, `conversations`, `journal_entries`, `daily_plans`, `admin_audit_logs`
- User table stores authentication credentials (bcrypt hashed passwords) and password reset tokens (time-limited, 1-hour expiration)
- **Sessions table** tied to user accounts via foreign key, supports up to 3 sessions per user (owned + collaborations), includes `owner_id` for session ownership, name field (15-character limit, default "Session N"), created_at for automatic numbering
- **Session collaborators table** links users to shared sessions with unique constraint on (session_id, user_id), cascading deletes when session or user is deleted
- **Documents table** with AI categorization (12 categories), AI-generated descriptions (user-editable, up to 200 characters), text extraction, and thumbnail support
- **Audio recordings table** with AI categorization (12 categories), AI-generated summaries (user-editable, up to 150 characters), transcription, and duration tracking
- Journal entries with AI-generated content, metadata, and entry types
- Daily plans with AI-generated content, user edits, viewed status, and date tracking
- Conversations include rich media support (message_type, document_id, media_url fields)
- Cascading deletes: deleting user removes all sessions and associated data (including S3 files), deleting individual session removes all session data
- Sessions expire after 60 minutes of inactivity
- **Database migrations** run automatically on startup via `run_migrations()` in `backend/app/core/migrations.py`
- Database can be reset with `RESET_DB=true` environment variable (development/production)

**Storage (AWS S3)**
- Medical documents uploaded to S3 with unique keys
- Text extraction happens on upload (PDF, images via OCR)
- Extracted text stored in database for quick access
- Presigned URLs generated for secure document access (24-hour expiration)
- Native GPT-5.1 file support via presigned URLs passed to OpenAI API

### Critical Safety Architecture

All AI configuration (models, prompts, safety boundaries) is centralized in `backend/app/config/ai_config.py` for easy maintenance.

**The system prompt** enforces all safety boundaries:

```python
# From backend/app/config/ai_config.py
SYSTEM_PROMPT = """You are AretaCare...
STRICT SAFETY BOUNDARIES - YOU MUST NEVER:
- Diagnose any medical condition
- Recommend or adjust medications
- Predict medical outcomes
- Dispute clinician decisions
- Give medical instructions
"""
```

**This prompt is the enforcement mechanism for all safety requirements.** Any changes to AI behavior must update this prompt in `ai_config.py` while maintaining safety boundaries.

**AI Configuration Structure:**
- **Models**: `CHAT_MODEL = "gpt-5.1"`, `TRANSCRIPTION_MODEL = "gpt-4o-transcribe"`
- **All Prompts**: System prompt, conversation instructions, task-specific prompts (jargon translation, conversation coaching, document/audio categorization, journal synthesis, daily plan generation)
- **Categories**: Document categories (12 types), Audio categories (12 types)
- **Fallback Messages**: Error responses when AI calls fail
- **All services use OpenAI Responses API**

See `backend/app/config/README.md` for complete documentation on modifying AI behavior.

### Application Architecture

**Conversation-First Design**
- Chat interface with AI care advocate, "Thinking..." status, enhanced markdown rendering
- Color-aware styling (prose-invert for user, prose-gray for AI)
- Smart scrolling (auto-scroll near bottom, stops at input not footer), scroll-to-bottom button
- Messages support text, documents, images, voice recordings
- Mobile-optimized: compact padding (`p-2 md:p-4`), smaller text, touch-friendly buttons

**AI Journal Synthesis**
- `JournalService.assess_and_synthesize()` analyzes conversations for medical significance
- Uses user's local timezone (frontend sends `entry_date` in YYYY-MM-DD format)
- Creates structured entries: title, content, entry type, date
- Marks messages as `synthesized_to_journal=True`

**GPT-5.1 Native File Support**
- Uses OpenAI Responses API with presigned S3 URLs
- Supports PDFs, images (PNG, JPG), text files
- OCR text extraction as fallback

### Authentication & Privacy Model

**User Authentication:**
- JWT-based authentication with 7-day token expiration
- Passwords hashed with bcrypt (72-byte maximum due to bcrypt limitation)
- Minimum password length: 8 characters
- Registration requires three acknowledgements: not medical advice, beta version, email communications
- Auth token stored in localStorage, included in API requests via Authorization header
- Protected routes on both frontend (React Router) and backend (FastAPI dependencies)
- Email notifications sent for password changes, email changes, and collaborator actions

**Session Management:**
- **Multi-session support**: Each user can have up to 3 active sessions (owned + collaborations combined)
- Sessions created via header dropdown "New Session" button (shows error if 3 sessions already exist)
- Active session ID stored in browser localStorage
- All data (documents, conversations, journal, daily plans, audio) tied to both user account and session ID
- Sessions have both `user_id` (creator) and `owner_id` (current owner) for ownership tracking
- Session naming: Default "Session 1/2/3" with smart numbering (fills gaps if sessions deleted), renameable up to 15 characters (owner only)
- Session switching: Click user name in header to see session dropdown with all sessions (owned and shared), active session indicator, and "New Session" button
- Deleting individual session removes all session data (database + S3 files: documents, thumbnails, audio) - owner only
- Deleting user account removes all owned sessions and leaves all collaborations
- Sessions auto-expire via `SESSION_TIMEOUT_MINUTES` (default: 60)

**Session Sharing:**
- Session owners can share sessions with other AretaCare users by email
- Maximum 5 people per session (1 owner + 4 collaborators)
- Collaborators have full access to session data (documents, conversations, journal, daily plans, audio)
- Only session owners can: rename session, delete session, share with others, revoke collaborator access
- Collaborators can leave shared sessions at any time
- Shared sessions count toward the collaborator's 3-session limit
- Permission checking via `check_session_access()` in `backend/app/api/permissions.py`

## Key Files and Their Roles

### Backend
**API Routes** (`backend/app/api/`):
- `auth.py` - Authentication (register, login, /me) and user management (update account, password reset, deletion)
- `sessions.py` - Multi-session management (3-session limit, rename, delete with S3 cleanup, sharing/collaboration)
- `permissions.py` - Shared permission checking (`check_session_access()` for owner/collaborator validation)
- `documents.py` - Document upload/management with AI categorization
- `audio_recording.py` - Audio recording management with AI categorization
- `conversation.py` - Conversation endpoints with rich media support
- `journal.py` - Journal CRUD operations
- `daily_plans.py` - Daily plan management (generate, list, update)
- `tools.py` - Standalone tools (Jargon Translator, Conversation Coach)
- `admin.py` - Admin console (metrics, health, S3 cleanup, audit log)

**Models** (`backend/app/models/`): `user.py`, `session.py`, `session_collaborator.py`, `document.py`, `audio_recording.py`, `journal.py`, `daily_plan.py`, `conversation.py`, `admin_audit_log.py`

**AI Configuration** (CRITICAL):
- `backend/app/config/ai_config.py` - All models, prompts, safety boundaries, categories
- `backend/app/config/README.md` - Documentation for modifying AI behavior

**Services** (`backend/app/services/`):
- `openai_service.py` - GPT-5.1 integration via Responses API, all LLM interactions
- `journal_service.py` - Conversation analysis and journal synthesis
- `daily_plan_service.py` - Daily plan generation
- `s3_service.py` - S3 upload/download/delete, presigned URLs
- `document_processor.py` - Text extraction (PDF, OCR), thumbnail generation
- `email_service.py` - Email notifications via Gmail SMTP (password changes, email changes, collaborator management, password reset)
- `admin_service.py` - Admin metrics, S3 orphan detection, audit log management

**Core** (`backend/app/core/`):
- `migrations.py` - Database migrations (auto-adds columns)
- `auth.py` - JWT & bcrypt utilities
- `config.py` - Pydantic settings

### Frontend
**Pages** (`frontend/src/pages/`):
- `Conversation.jsx` - Main chat interface with daily plan panel
- `JournalView.jsx` - Journal with date navigation
- `DailyPlan.jsx` - Daily plan history and editing
- `Settings.jsx` - Account management, session management
- `Documents.jsx` - AI-powered document manager
- `AudioRecordings.jsx` - AI-powered audio manager
- `Login.jsx`, `Register.jsx`, `PasswordReset.jsx` - Authentication
- `About.jsx`, `TermsOfService.jsx`, `PrivacyPolicy.jsx` - Info pages
- `admin/` - Admin console pages (Dashboard, Health, S3Cleanup, AuditLog)

**Components** (`frontend/src/components/`):
- `Header.jsx` - Navigation with session switcher
- `MessageBubble.jsx` - Chat message display
- `MessageInput.jsx` - Chat input with audio recording
- `AudioWaveform.jsx` - Real-time waveform visualization
- `DailyPlan/DailyPlanPanel.jsx` - Collapsible daily plan sidebar
- `CollaborationModal.jsx` - Session sharing modal (add/remove collaborators)

**Context & Services**:
- `contexts/SessionContext.jsx` - Multi-session state management
- `contexts/AdminContext.jsx` - Admin authorization state
- `services/api.js` - Axios instance with auth interceptor

## Important Configuration Details

### Docker Networking

Frontend runs **inside Docker container**, so:
- Must use relative URLs (`/api`) not `http://localhost:8000`
- Vite proxy in `vite.config.js` forwards `/api` to `http://backend:8000`
- `backend` resolves via Docker Compose service name

### CORS Configuration

Backend must allow the **actual browser origin** (not Docker internal):
- Port 3001 is exposed (not 3000, to avoid conflicts)
- CORS_ORIGINS in `backend/.env` must include `http://localhost:3001`

### Environment Variables

Backend requires (`backend/.env`):
- `OPENAI_API_KEY` - For GPT-5.1 interactions (Responses API)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` - For document storage
- `DATABASE_URL` - Auto-configured in Docker Compose
- `SECRET_KEY` - For JWT signing
- `CORS_ORIGINS` - Comma-separated allowed origins
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `FRONTEND_URL` - For email notifications: password reset, password changes, email changes, collaborator management (see docs/EMAIL_SETUP.md)
- `ADMIN_EMAILS` - Comma-separated list of admin email addresses (e.g., `admin@example.com,other@example.com`)
- `AUDIT_LOG_RETENTION_DAYS` - GDPR compliance: auto-delete audit logs older than this (default: 90)
- `S3_KEY_PREFIX` - Environment prefix for shared S3 buckets (e.g., `dev/` or `prod/`)
- `RESET_DB` - Optional: Set to "true" to drop and recreate database on startup (development/production)

Frontend optional (`frontend/.env`):
- `VITE_API_URL` - Override API URL (defaults to `/api`)

### Package Version Constraints

**System Dependencies** (installed via apt in Dockerfile):
- `tesseract-ocr` - OCR engine for extracting text from images
- `poppler-utils` - Required for PDF thumbnail generation (provides pdftoppm)
- `ffmpeg` - Required for audio transcription (provides ffprobe for audio file processing)

**Python Package Versions** (in `backend/requirements.txt`):
- `httpx<0.28.0` - Version 0.28+ breaks OpenAI client
- `openai>=1.56.0` - Earlier versions have httpx incompatibility
- `pytesseract==0.3.10` - Python wrapper for tesseract-ocr (OCR capability)
- `pdf2image==1.16.3` - PDF to image conversion for thumbnail generation
- `bcrypt<5.0.0` - **CRITICAL**: Version 5.x incompatible with passlib 1.7.4
  - Passlib 1.7.4 cannot read bcrypt 5.x's `__about__` attribute
  - Causes ValueError during password hashing initialization
  - Must use bcrypt 4.x for compatibility
- `passlib[bcrypt]==1.7.4` - Password hashing with bcrypt backend
- `python-jose[cryptography]==3.3.0` - JWT token creation/validation

## Common Development Scenarios

### Adding a New API Endpoint
1. Add route to `backend/app/api/[route].py`
2. Create schema in `backend/app/schemas/` if needed
3. Add auth dependency: `current_user: User = Depends(get_current_user)`
4. Restart: `docker compose restart backend`

### Modifying AI Behavior
Edit `backend/app/config/ai_config.py`:
- Change model: `CHAT_MODEL = "gpt-5.1"`
- Modify prompts: `SYSTEM_PROMPT` or task-specific prompts
- Update categories: `DOCUMENT_CATEGORIES` or `AUDIO_CATEGORIES`
- **Always maintain safety boundaries**
- See `backend/app/config/README.md` for details

### Adding a Frontend Page
1. Create in `frontend/src/pages/`
2. Use Tailwind breakpoints (sm:, md:, lg:) for responsiveness
3. Add dark mode classes (see Dark Mode Styling below)
4. Add route in `App.jsx`, nav link in `Header.jsx`

### Dark Mode Styling
Use Tailwind `dark:` prefix for all UI elements:
- Backgrounds: `bg-white dark:bg-gray-800`, `bg-gray-50 dark:bg-gray-700`
- Text: `text-gray-900 dark:text-white`, `text-gray-600 dark:text-gray-400`
- Borders: `border-gray-200 dark:border-gray-700`
- Colored badges: `bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300`
- Hover states: `hover:bg-gray-50 dark:hover:bg-gray-700`

Theme managed via `ThemeContext.jsx`, persisted to localStorage.

### Database Schema Changes
1. Add column to model in `backend/app/models/`
2. Add migration in `backend/app/core/migrations.py`
3. Restart: `docker compose restart backend`
4. Reset DB: `docker compose down -v && docker compose up -d`

### Common Technical Issues

**S3 AccessDenied**: Ensure IAM policy grants `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:PutObjectAcl`. See `docs/AWS_IAM_POLICY.md`.

**Journal API metadata error**: Add `extra = "ignore"` to Pydantic schema Config in `backend/app/schemas/journal.py`.

**Audio transcription error**: Ensure `ffmpeg` is in Dockerfile system dependencies.

**Timezone issues**: Frontend sends user's local date (`entry_date` in YYYY-MM-DD) with messages. Parse dates client-side using local timezone, not UTC.

## Testing the Application

**Access Points:**
- Frontend: http://localhost:3001
- API Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

**First-time Setup:**
1. Navigate to http://localhost:3001
2. Create account (8-72 character password, check three acknowledgement boxes)
3. Auto-logged in and redirected

**Key Features to Test:**
- Registration with three required acknowledgements
- Conversation interface with text/voice/document input
- Multi-session management (up to 3 sessions, rename, switch)
- Session sharing (share by email, collaborator access, leave session)
- Email notifications (password changes, email changes, collaborator actions)
- Journal with date navigation and timezone handling
- Daily Plan generation and editing
- Documents/Audio with AI categorization
- Settings: account updates, session management, password reset
- Admin console (requires email in ADMIN_EMAILS): metrics, health, S3 cleanup, audit log
- Mobile responsiveness

## Safety Guideline Enforcement

**Read `docs/SAFETY_GUIDELINES.md` before modifying any AI-related code.**

The application's core value proposition is maintaining safety boundaries. Any code changes that:
- Modify `backend/app/config/ai_config.py` (AI prompts, models, or settings)
- Modify AI service files (`openai_service.py`, `journal_service.py`, `daily_plan_service.py`)
- Add new LLM features
- Change how medical information is presented

Must be reviewed against the safety guidelines to ensure:
- No diagnosis or treatment recommendations
- No outcome predictions
- Deference to medical professionals
- Calm, professional tone maintained

**All AI prompts and safety boundaries are defined in `backend/app/config/ai_config.py`** - this is the primary file to review for safety compliance.

## Production Deployment

**Render.com via `render.yaml` Blueprint:**

Services: PostgreSQL DB, FastAPI backend, React static site

Required env vars: `OPENAI_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `ADMIN_EMAILS`

Optional: `S3_KEY_PREFIX` (for shared buckets), `AUDIT_LOG_RETENTION_DAYS` (default: 90)

Auto-configured: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`

Database migrations run automatically on startup.

## Documentation

- `README.md` - **Comprehensive project documentation**: Overview, quick start guide, architecture, setup, deployment, API reference
- `CLAUDE.md` - This file: Guidance for Claude Code when working with the codebase
- `docs/SETUP_GUIDE.md` - Detailed setup with AWS/OpenAI configuration
- `docs/API_USAGE.md` - API endpoint examples and reference
- `docs/SAFETY_GUIDELINES.md` - **Critical**: Safety requirements and boundaries
- `docs/AWS_IAM_POLICY.md` - AWS S3 IAM policy configuration
