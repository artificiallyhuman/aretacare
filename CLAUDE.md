# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AretaCare is an AI-powered medical care advocate assistant that helps families understand complex medical information. It maintains **strict safety boundaries** - never diagnosing, recommending treatments, or predicting outcomes. The core function is to translate medical jargon, summarize clinical notes, and help families prepare questions for healthcare teams.

**Key Features:**
- **Conversation-first interface** with AI care advocate as the primary interaction model, "Thinking..." status during AI processing
- **Enhanced markdown rendering** with custom ReactMarkdown components, color-aware styling, and clean typography
- **Daily Plan** - AI-generated daily summaries with priorities, reminders, and questions for care team (requires sufficient data, auto-generates after 2 AM, user editable, delete and regenerate capability, replaces journal sidebar)
- **AI Journal Synthesis** that automatically extracts and organizes medical updates from conversations with user's local timezone
- **Journal with date navigation** - reverse chronological order, sticky sidebar with date selector, smooth scroll-to-date functionality, entry types include: appointment, symptom, medication, test_result, milestone, note, other
- **GPT-5.1 native file support** for PDFs and images via Responses API
- **Audio recording** with live waveform visualization, separate start/stop buttons, visual feedback, and real-time transcription
- JWT-based user authentication with secure password hashing, disclaimer shown on login/register screens
- **Settings page** - Secure account management with password-verified updates (name, email, password), password reset via email with time-limited tokens, clear session with statistics (keeps account), and complete account deletion
- Session-based conversation history tied to user accounts
- Collapsible daily plan panel (replaces journal sidebar) showing current plan on conversation page
- **About page** with tabbed interface: "The Platform" tab with feature descriptions, "The Story" tab with origin story
- **Legal pages** - Professional Terms of Service and Privacy Policy with gradient backgrounds, warning boxes, and GitHub repository links
- Professional UI with modern design and smart UI behaviors (click-away dropdowns, smart scrolling, collapsible mobile Tools submenu)
- **Mobile-optimized design** with compact sizing, native feel, hamburger menu navigation, touch-friendly interfaces, and collapsible sidebars
- **AI-powered Documents Manager** with automatic categorization (12 categories), AI-generated descriptions (user-editable, up to 200 characters), searchable text extraction, date-based organization with sticky sidebar, scroll-to-date navigation (matching Journal page), mobile-responsive collapsible sidebar, and thumbnail previews
- **AI-powered Audio Recordings** with automatic transcription, AI categorization (12 categories), AI-generated summaries (user-editable, up to 150 characters), date-based organization with sticky sidebar, scroll-to-date navigation (matching Journal page), and mobile-responsive collapsible sidebar
- **Complete data deletion** - Session deletion removes all PostgreSQL data and S3 files (documents, thumbnails, audio recordings) with zero orphaned files
- Specialized tools: Jargon Translator (with voice input and waveform), Conversation Coach (with voice recording and waveform)

## Development Commands

### Local Development (Docker)

Start all services:
```bash
docker compose up --build
```

Start in detached mode:
```bash
docker compose up -d
```

Stop services:
```bash
docker compose down
```

Stop and remove volumes (reset database):
```bash
docker compose down -v
```

### Service-Specific Commands

View logs:
```bash
docker compose logs backend         # Backend API logs
docker compose logs frontend        # Frontend logs
docker compose logs db              # Database logs
docker compose logs -f backend      # Follow backend logs
```

Restart individual services:
```bash
docker compose restart backend
docker compose restart frontend
```

Rebuild specific service:
```bash
docker compose up -d --build backend
docker compose up -d --build frontend
```

### Environment Configuration

Generate secret key for backend:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
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
- Session management via `useSession` hook stores session ID in localStorage
- **User authentication** with JWT tokens stored in localStorage
- Auth token automatically included in API requests via axios interceptor
- Protected routes redirect to login if not authenticated

**Database (PostgreSQL)**
- Seven main tables: `users`, `sessions`, `documents`, `audio_recordings`, `conversations`, `journal_entries`, `daily_plans`
- User table stores authentication credentials (bcrypt hashed passwords) and password reset tokens (time-limited, 1-hour expiration)
- Sessions tied to user accounts via foreign key
- **Documents table** with AI categorization (12 categories), AI-generated descriptions (user-editable, up to 200 characters), text extraction, and thumbnail support
- **Audio recordings table** with AI categorization (12 categories), AI-generated summaries (user-editable, up to 150 characters), transcription, and duration tracking
- Journal entries with AI-generated content, metadata, and entry types
- Daily plans with AI-generated content, user edits, viewed status, and date tracking
- Conversations include rich media support (message_type, document_id, media_url fields)
- Cascading deletes: deleting user removes all associated data
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
- Primary interface is a conversational chat with AI care advocate
- "Thinking..." status indicator during AI response processing (replaces "Sending...")
- Enhanced markdown rendering with custom ReactMarkdown components for clean, readable formatting
- Color-aware styling: prose-invert for user messages, prose-gray for AI messages
- Daily plan panel on conversation page; Journal has dedicated page with date navigation
- Welcome page with "How to Get Started" instructions directing users to message box
- Messages can include text, uploaded documents (PDFs), images, and voice recordings
- Separate audio recording buttons: start (microphone icon) and stop (red button with "Stop" text)
- Smart scrolling: auto-scroll only when user is near bottom and messages exist, stops at message input (not footer)
- Compact message spacing (space-y-2) for better conversation flow
- Mobile-optimized: compact padding (p-2 md:p-4), smaller text sizes, touch-friendly buttons
- Conversation history persists across sessions

**AI Journal Synthesis**
- `JournalService` analyzes user messages and AI responses for medical significance
- Uses `assess_and_synthesize()` to determine if conversation warrants journal entries
- **Uses user's local timezone** for accurate date recording (frontend sends `entry_date` in YYYY-MM-DD format)
- Automatically creates structured entries with:
  - Title (brief summary)
  - Content (detailed information)
  - Entry type (appointment, symptom, medication, test_result, milestone, note)
  - Date (user's local date, not server time)
- Marks conversation messages as `synthesized_to_journal=True` when processed
- Users can manually add, edit, or delete journal entries

**Journal Page Features**
- **Reverse chronological order**: Most recent entries appear first
- **Date selector sidebar**: Sticky navigation showing all dates with entry counts
- **Scroll-to-date functionality**: Click any date to smoothly scroll to that section
- **Proper date parsing**: Uses local timezone (YYYY-MM-DD split parsing, not UTC)
- **Mobile-optimized**: Compact padding, smaller text, responsive date navigation
- Search and filter capabilities by entry type

**GPT-5.1 Native File Support**
- Uses OpenAI Responses API (`openai.beta.responses.create()`)
- Documents and images passed via presigned S3 URLs
- `document_url` and `document_type` parameters in `chat_with_journal()` method
- Supports PDFs, images (PNG, JPG), and text files
- OCR text extraction stored as fallback for compatibility

**Smart UI Behavior**
- Click-away dropdown menus (tools menu closes when clicking outside)
- Smart scrolling: auto-scroll only when near bottom and messages exist, stops at message input box (not footer)
- Scroll-to-bottom button appears when user scrolls up in conversation
- **Red Clear Session button** (dangerous action) vs. neutral Logout button
- **Disclaimer on authentication screens only** (login/register), not cluttering logged-in interface
- Responsive design with mobile hamburger menu (lg breakpoint)
- Image thumbnails in Documents page with 192px height preview cards
- S3 file cleanup on session deletion prevents orphaned files in storage
- Compact message spacing (space-y-2) for better conversation flow

**Mobile Optimization**
- **Native app-like feel** with compact sizing and appropriate spacing
- Reduced padding: `p-2 md:p-4`, `py-1.5 md:py-2` throughout
- Smaller text: `text-xs md:text-sm`, `text-sm md:text-base` for better screen utilization
- Touch-friendly buttons: adequate size with compact spacing
- **Clear visual separation** between About link and dangerous actions (Clear Session/Logout) with border divider
- Responsive welcome message with progressive disclosure (hidden breaks on mobile)
- Compact disclaimer (mb-0, smaller padding) on auth screens
- Mobile-friendly header with smaller user avatar (w-7 h-7 vs w-8 h-8)

### Authentication & Privacy Model

**User Authentication:**
- JWT-based authentication with 7-day token expiration
- Passwords hashed with bcrypt (72-byte maximum due to bcrypt limitation)
- Minimum password length: 8 characters
- Auth token stored in localStorage, included in API requests via Authorization header
- Protected routes on both frontend (React Router) and backend (FastAPI dependencies)

**Session Management:**
- Session ID created when user first uses the app (after login/register)
- Session ID stored in browser localStorage
- All data (documents, conversations) tied to both user account and session ID
- Sessions belong to specific users (foreign key relationship)
- Clearing session deletes conversation history but keeps user account
- Sessions auto-expire via `SESSION_TIMEOUT_MINUTES` (default: 60)

## Key Files and Their Roles

### Backend Entry Points

- `backend/app/main.py` - FastAPI application, CORS config, route mounting
- `backend/app/api/__init__.py` - Combines all API routers
- `backend/app/api/auth.py` - **Authentication endpoints** (register, login, /me) and **user management** (update name/email/password with password verification, password reset via email, account deletion)
- `backend/app/api/sessions.py` - Session management with complete S3 cleanup on delete (documents, thumbnails, audio files), statistics endpoint for session data counts
- `backend/app/api/documents.py` - Document upload/management with AI categorization, filtering, search, and presigned URLs
- `backend/app/api/audio_recording.py` - Audio recording management with AI categorization, filtering, and search
- `backend/app/api/conversation.py` - Conversation endpoints with rich media support
- `backend/app/api/journal.py` - Journal CRUD operations
- `backend/app/api/daily_plans.py` - **Daily plan management** (generate, list, update, mark viewed)
- `backend/app/api/tools.py` - Standalone tools (Jargon Translator, Conversation Coach)
- `backend/app/core/config.py` - Pydantic settings, environment variables
- `backend/app/core/database.py` - SQLAlchemy session management
- `backend/app/core/auth.py` - **JWT & password hashing utilities** (bcrypt, jose)

### Models & Schemas

- `backend/app/models/user.py` - User model with authentication fields and password reset tokens (time-limited, 1-hour expiration)
- `backend/app/models/session.py` - Session model with user foreign key
- `backend/app/models/document.py` - Document model with DocumentCategory enum (12 categories: lab_results, imaging_reports, clinic_notes, medication_records, discharge_summary, treatment_plan, test_results, referral, insurance_billing, consent_form, care_instructions, other), AI-generated descriptions
- `backend/app/models/audio_recording.py` - Audio recording model with AudioRecordingCategory enum (12 categories: symptom_update, appointment_recap, medication_note, question_for_doctor, daily_reflection, progress_update, side_effects, care_instruction, emergency_note, family_update, treatment_observation, other), AI-generated summaries
- `backend/app/models/journal.py` - Journal entries with AI-generated content, EntryType enum includes: MEDICAL_UPDATE, TREATMENT_CHANGE, APPOINTMENT, INSIGHT, QUESTION, MILESTONE, OTHER
- `backend/app/models/daily_plan.py` - **Daily plans** with content, user edits, viewed status
- `backend/app/models/conversation.py` - Conversation messages with rich media support
- `backend/app/schemas/auth.py` - Auth request/response schemas (UserRegister, UserLogin, TokenResponse, UpdateName, UpdateEmail, UpdatePassword, DeleteAccount, PasswordResetRequest, PasswordReset)
- `backend/app/schemas/document.py` - Document schemas with category serialization for backward compatibility
- `backend/app/schemas/audio_recording.py` - Audio recording schemas with category serialization for backward compatibility
- `backend/app/schemas/journal.py` - Journal entry schemas with synthesis metadata
- `backend/app/schemas/daily_plan.py` - Daily plan schemas (DailyPlanResponse, DailyPlanUpdate, DailyPlanCheckResponse)
- `backend/app/schemas/conversation.py` - Message schemas with document/image support

### AI Configuration

- `backend/app/config/ai_config.py` - **CRITICAL**: Centralized AI configuration with all models, prompts, safety boundaries, categories, context limits, and fallback messages
- `backend/app/config/README.md` - Complete documentation for modifying AI behavior, changing models, and adjusting prompts

### Service Layer (Business Logic)

- `backend/app/services/openai_service.py` - GPT-5.1 integration via Responses API, all LLM interactions, uses prompts from `ai_config.py`, includes `categorize_document()` and `categorize_audio_recording()` methods for AI-powered categorization
- `backend/app/services/journal_service.py` - **Journal synthesis logic**: Analyzes conversations via Responses API, creates journal entries with user's local date (accepts `entry_date` parameter), uses `ai_config.py` for prompts and model settings
- `backend/app/services/daily_plan_service.py` - **Daily plan generation**: Validates sufficient data (journal entries or conversations), gathers context, generates concise plans via Responses API, uses `ai_config.py` for prompts and model settings
- `backend/app/services/s3_service.py` - Document upload/download/delete to S3, presigned URL generation
- `backend/app/services/document_processor.py` - Text extraction (PDF, OCR for images) and PDF thumbnail generation (first page, 150 DPI, max 300px width)
- `backend/app/services/email_service.py` - **Email service**: Sends password reset emails via Gmail SMTP with professional HTML templates, handles development mode (logs to console) and production mode (sends emails)
- `backend/app/core/migrations.py` - **Database migrations**: Automatically adds new columns (category, ai_description for documents; category, ai_summary for audio_recordings; reset_token, reset_token_expires for users) without requiring database reset

### Frontend Entry Points

- `frontend/src/main.jsx` - React app entry point
- `frontend/src/App.jsx` - Router configuration, protected/public routes, layout with responsive footer
- `frontend/src/pages/Login.jsx` - Login page with disclaimer, professional styling, mobile-responsive (no "Welcome" heading), password reset link
- `frontend/src/pages/Register.jsx` - Registration page with disclaimer, professional styling, mobile-responsive
- `frontend/src/pages/PasswordReset.jsx` - **Password reset page** with two-step flow (request reset via email, then reset with token), professional styling, secure token handling (no display to client)
- `frontend/src/pages/Settings.jsx` - **Settings page** with collapsible accordion sections for account management (update name/email/password with password verification, clear session with statistics, delete account), displays data counts before deletion
- `frontend/src/pages/Conversation.jsx` - **Main conversation interface** with chat + daily plan panel, smart scrolling (stops at message box), welcome page, "Thinking..." status, sends user's local date for journal entries
- `frontend/src/pages/DailyPlan.jsx` - **Daily plan page** with full history list, edit mode, delete and regenerate functionality, enhanced markdown rendering
- `frontend/src/pages/JournalView.jsx` - **Journal page with date navigation** - reverse chronological (newest first within each date), sticky sidebar with date selector, scroll-to-date, proper local timezone parsing
- `frontend/src/pages/About.jsx` - **About page** with tabbed interface ("The Platform" and "The Story" tabs), feature descriptions, and origin story
- `frontend/src/pages/TermsOfService.jsx` - **Terms of Service page** with professional formatting, gradient backgrounds, warning boxes with icons, and GitHub repository links
- `frontend/src/pages/PrivacyPolicy.jsx` - **Privacy Policy page** with clear data handling explanation, formatted warning sections, and comprehensive privacy information
- `frontend/src/pages/tools/Documents.jsx` - **AI-powered Documents Manager** with 12 categories, AI descriptions, search/filter, sticky sidebar with date selector, scroll-to-date functionality (matching Journal page behavior), mobile-responsive collapsible sidebar, thumbnail previews
- `frontend/src/pages/AudioRecordings.jsx` - **AI-powered Audio Recordings** with 12 categories, AI summaries, search/filter, sticky sidebar with date selector, scroll-to-date functionality (matching Journal page behavior), mobile-responsive collapsible sidebar, audio playback
- `frontend/src/pages/tools/` - Standalone tools (JargonTranslator, ConversationCoach) - disclaimer removed from individual tool pages
- `frontend/src/components/Header.jsx` - **Mobile-responsive navigation** with hamburger menu, tools dropdown (collapsible submenu on mobile), clickable user name/avatar for Settings access
- `frontend/src/components/Footer.jsx` - Footer with links to Terms of Service, Privacy Policy, GitHub repository, and Report Issue
- `frontend/src/components/Disclaimer.jsx` - Compact safety disclaimer shown only on login/register screens
- `frontend/src/components/WarningsContainer.jsx` - Reusable component for displaying multiple warnings, used on login/register pages
- `frontend/src/components/DailyPlan/DailyPlanPanel.jsx` - Collapsible daily plan sidebar with mobile-optimized padding and text sizes
- `frontend/src/components/MessageBubble.jsx` - Chat message display with custom ReactMarkdown components and color-aware styling
- `frontend/src/components/MessageInput.jsx` - Chat input with "Thinking..." status, mobile-optimized sizing, separate start/stop audio recording buttons with live waveform visualization
- `frontend/src/components/AudioWaveform.jsx` - **Real-time audio waveform visualization** using Web Audio API and canvas-based drawing, provides immediate visual feedback during recording
- `frontend/src/services/api.js` - Axios instance with auth token interceptor, conversation API includes entry_date parameter
- `frontend/src/hooks/useSession.js` - Session & auth state management (calls /auth/me), exposes setUser for updating user state after account changes
- `frontend/src/styles/index.css` - Tailwind CSS with responsive custom components (.btn-primary, .card, .input, .textarea)

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
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `FRONTEND_URL` - For password reset emails (see docs/EMAIL_SETUP.md)
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

### Working with Authentication

**Testing Auth Endpoints:**
```bash
# Register a new user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"testpass123"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Get current user (requires token)
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

**Important Notes:**
- Passwords must be 8-72 characters (bcrypt limitation)
- JWT tokens expire after 7 days
- Frontend automatically includes auth token via axios interceptor
- After login/register, use `window.location.href = '/'` to reload and initialize session

### Adding a New API Endpoint

1. Add route to appropriate file in `backend/app/api/`
2. Create schema in `backend/app/schemas/` if needed
3. Add authentication dependency if needed: `current_user: User = Depends(get_current_user)`
4. Restart backend: `docker compose restart backend`

### Modifying AI Behavior

All AI configuration is in `backend/app/config/ai_config.py`:

1. **Change AI model**: Edit `CHAT_MODEL = "gpt-5.1"` to desired OpenAI model
2. **Modify prompts**: Edit `SYSTEM_PROMPT` or any task-specific prompt functions
3. **Update categories**: Edit `DOCUMENT_CATEGORIES` or `AUDIO_CATEGORIES` dictionaries
4. **Maintain all safety boundaries** - never remove safety restrictions from prompts
5. Test thoroughly with medical text samples
6. Restart backend: `docker compose restart backend`

See `backend/app/config/README.md` for detailed documentation on all available settings.

### Adding a New Frontend Page

1. Create component in `frontend/src/pages/`
2. Ensure mobile responsiveness using Tailwind breakpoints (sm:, md:, lg:)
3. Use consistent spacing: `py-6 sm:py-8 lg:py-12` for page padding
4. Use responsive text sizes: `text-2xl sm:text-3xl` for headings
5. For content-heavy pages, use intro sentences followed by bullet points for better organization
6. Add route in `frontend/src/App.jsx`
7. Add navigation link in `frontend/src/components/Header.jsx` (both desktop and mobile menus)
   - Desktop: Links appear in nav order (Conversation → Journal → Tools dropdown → About → User section)
   - Mobile: Same order within mobile menu
8. Hot reload handles updates automatically

### Debugging Connection Issues

Frontend to Backend:
```bash
# Inside frontend container, test backend connectivity
docker compose exec frontend wget -O- http://backend:8000/health
```

Browser to Frontend:
```bash
# Check frontend is accessible
curl http://localhost:3001
```

Backend API directly:
```bash
# Test backend endpoint
curl http://localhost:8000/api/sessions/ -X POST
```

### Database Schema Changes

1. Models are in `backend/app/models/`
2. Database auto-creates tables on startup via SQLAlchemy
3. **Migrations** run automatically on startup via `run_migrations()` in `backend/app/core/migrations.py`
   - Adds new columns without requiring database reset
   - Checks if column exists before adding
   - Backward compatible - safe to run multiple times
4. To add a new column:
   - Add column to model in `backend/app/models/`
   - Add migration in `backend/app/core/migrations.py` to check and add column
   - Restart backend: `docker compose restart backend`
5. To reset schema entirely: `docker compose down -v && docker compose up -d`

### AWS S3 Permissions Troubleshooting

**Error: AccessDenied when uploading documents**

If you see this error in backend logs:
```
ERROR - Failed to upload file to S3: An error occurred (AccessDenied) when calling the PutObject operation:
User: arn:aws:iam::ACCOUNT_ID:user/USERNAME is not authorized to perform: s3:PutObject on resource: "arn:aws:s3:::BUCKET_NAME/..."
```

**Solution:**
1. Go to AWS Console → IAM → Users → Select your IAM user
2. Go to "Permissions" tab → "Add permissions" → "Create inline policy"
3. Use the JSON policy from `docs/AWS_IAM_POLICY.md`
4. The policy must grant these permissions on your S3 bucket:
   - `s3:PutObject` - Upload documents
   - `s3:GetObject` - Download documents
   - `s3:DeleteObject` - Delete documents
   - `s3:PutObjectAcl` - Set object permissions

**Quick IAM Policy Template:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:PutObjectAcl"
            ],
            "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
        }
    ]
}
```

Replace `YOUR_BUCKET_NAME` with your actual S3 bucket name. See `docs/AWS_IAM_POLICY.md` for complete setup instructions.

### Common Technical Issues

**Journal API: Response Validation Error (metadata)**

If you see:
```
ResponseValidationError: Input should be a valid dictionary
'metadata': MetaData()
```

**Cause:** SQLAlchemy models have an internal `metadata` class attribute for schema information. Pydantic was trying to serialize this instead of ignoring it.

**Fix:** Add `extra = "ignore"` to Pydantic schema Config in `backend/app/schemas/journal.py`:
```python
class Config:
    from_attributes = True
    extra = "ignore"  # Ignore SQLAlchemy internal attributes
```

**Audio Transcription: ffprobe not found**

If you see:
```
ERROR - Error transcribing audio with OpenAI: ffprobe not found. Please install ffmpeg.
```

**Cause:** ffmpeg is missing from the Docker container.

**Fix:** Add ffmpeg to system dependencies in `Dockerfile`:
```dockerfile
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libpq-dev \
    tesseract-ocr \
    ffmpeg \  # Add this line
    && rm -rf /var/lib/apt/lists/*
```

**Daily Plan Timezone Issues**

If daily plans show wrong dates (e.g., Nov 27 when locally Nov 26):

**Cause:** JavaScript `new Date("2025-11-27")` interprets as midnight UTC, displaying as previous day in earlier timezones.

**Fix:** Always pass user's local date to the API:
```javascript
const today = new Date();
const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
await dailyPlanAPI.generate(sessionId, userDate);
```

And parse dates in local timezone on frontend:
```javascript
const [year, month, day] = dateString.split('-').map(Number);
const date = new Date(year, month - 1, day); // Local timezone, not UTC
```

**Journal Date Recording (Fixed)**

Previously, journal entries used server's date (`date.today()` in Python), causing timezone issues where entries from "yesterday" appeared under "today."

**Solution:** Frontend sends user's local date with every message:
```javascript
// In Conversation.jsx
const today = new Date();
const userDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

await conversationAPI.sendMessage({
  content,
  session_id: sessionId,
  entry_date: userDate  // User's local date
});
```

Backend uses this date for journal entries:
```python
# In conversation.py
entry_date: Optional[str] = None  # User's local date (YYYY-MM-DD)

# In journal_service.py
use_date = entry_date if entry_date else date.today()  # Prefer user's date
```

This ensures journal entries always appear under the correct date in the user's timezone.

## Testing the Application

Access points after `docker compose up`:
- **Frontend**: http://localhost:3001
- **API Docs**: http://localhost:8000/docs (interactive Swagger UI)
- **Health Check**: http://localhost:8000/health

**First-time setup:**
1. Navigate to http://localhost:3001
2. Click "Create account" to register
3. Fill in name, email, and password (8-72 characters)
4. You'll be automatically logged in and redirected to the dashboard

**UI Features:**
- **Login/Register**: Disclaimer shown on auth screens only, clean interface without redundant "Welcome" headings
- **Conversation-first interface**: Main page is chat with AI care advocate, "Thinking..." status during AI processing
- **Enhanced markdown rendering**: Custom ReactMarkdown components with color-aware styling (prose-invert for user, prose-gray for AI)
- **Welcome page**: Clear onboarding with "How to Get Started" instructions and example topics directing to message box
- **Smart scrolling**: Auto-scroll when near bottom (only with messages), stops at message input box (not footer)
- **About page**: Comprehensive feature descriptions organized with intro sentences + color-coded bullet points
- **Daily plan panel**: Shows current plan on conversation page, banner notification when new plan is ready
- **Daily plan page**: Full history (most recent first), edit mode, delete and regenerate functionality
- **Journal page**: Reverse chronological order, date selector sidebar with scroll-to-date, proper timezone handling
- **Audio recording**: Separate start (microphone icon) and stop (red "Stop" button) with visual feedback
- **Settings page**: Clickable user name/avatar in header accesses Settings, secure account management with password verification, clear session with data statistics, password reset via email, complete account deletion
- **Navigation**: Collapsible Tools submenu on mobile, clickable user name/avatar for Settings access
- **Mobile-optimized**: Native app-like feel with compact sizing, touch-friendly buttons, collapsible sidebars on Documents/Audio pages, collapsible Tools submenu
- **Documents Manager**: AI-categorized uploads (12 categories), searchable descriptions, sticky sidebar with scroll-to-date navigation, mobile-responsive collapsible sidebar
- **Audio Recordings**: AI-categorized transcriptions (12 categories), searchable summaries, sticky sidebar with scroll-to-date navigation, mobile-responsive collapsible sidebar, audio playback
- File upload support: Upload PDFs, images (PNG, JPG), or text files in conversation
- Voice input support: Record audio in conversations, automatically transcribed and categorized

**Testing the Application:**

1. **Login**: See disclaimer on login screen, no redundant "Welcome" heading
2. **Welcome page**: See "How to Get Started" with instructions and example topics
3. **Start conversation**: Type in message box or click microphone to record voice, see "Thinking..." while AI processes
4. **Audio recording**: Click microphone, speak, click red "Stop" button when finished
5. **Upload a document**: Click attach button, select PDF or image
6. **Smart scrolling**: Scroll stops at message input box (not footer), auto-scrolls only when near bottom
7. **View About page**: Navigate to About in user section, switch between "The Platform" and "The Story" tabs
8. **Daily Plan**: Navigate to Daily Plan page, generate daily summary, edit or regenerate as needed
9. **Journal page**: View entries in reverse chronological order (newest first within each date), click dates in sidebar to scroll to specific dates, entries show correct dates in your timezone
10. **Documents Manager**: Upload files, see AI categorization, search and filter by category, click dates in sidebar to scroll to that date section (same as Journal)
11. **Audio Recordings**: View transcribed recordings, AI categories and summaries, search and filter, click dates in sidebar to scroll to that date section, play audio
12. **Tools section**: Access Jargon Translator and Conversation Coach (collapsible on mobile)
13. **Settings page**: Click user name/avatar in header, test updating name/email/password (requires current password), view session statistics
14. **Clear session**: In Settings page, clear session with confirmation, see data statistics (keeps account, deletes conversations/journal/documents/audio)
15. **Password reset**: Log out, click "Forgot password?" on login page, enter email, check backend logs for reset link (development mode) or email (production)
16. **Mobile testing**: Resize browser to mobile width, test collapsible sidebars on Documents/Audio pages, test collapsible Tools submenu

Sample medical text for testing:
```
Patient: John Doe
Date: 2025-01-15

Chief Complaint: Follow-up for hypertension

Vital Signs: BP 142/88 mmHg, HR 78 bpm

Assessment: Blood pressure elevated despite Lisinopril 10mg daily

Plan:
1. Increase Lisinopril to 20mg daily
2. Follow-up in 4 weeks
3. Home BP monitoring
```

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

Deployment via `render.yaml` Blueprint to Render.com:

### Services Created
- **aretacare-db**: PostgreSQL database (basic plan)
- **aretacare-backend**: FastAPI Docker web service (starter plan)
- **aretacare-frontend**: React static site (built from `frontend/dist`)

### Deployment Process
1. Push code to GitHub
2. In Render dashboard: Click "New +" → "Blueprint"
3. Connect GitHub repository - Render detects `render.yaml`
4. Add environment variables for backend:
   - `OPENAI_API_KEY` (required)
   - `AWS_ACCESS_KEY_ID` (required)
   - `AWS_SECRET_ACCESS_KEY` (required)
   - `S3_BUCKET_NAME` (required)
5. Auto-configured variables:
   - `DATABASE_URL` - Auto-injected from database
   - `SECRET_KEY` - Auto-generated
   - `CORS_ORIGINS` - Set to frontend URL
6. Click "Apply" to deploy all services
7. **Database migrations run automatically** on first backend startup - no manual intervention needed

### Important Files for Production
- `Dockerfile` (root) - Production backend build, copies from `backend/`
- `backend/Dockerfile` - Local development only (used by docker-compose.yml)
- `frontend/Dockerfile` - Local development only (used by docker-compose.yml)
- `render.yaml` - Blueprint configuration defining all services and plans

## Documentation

- `README.md` - **Comprehensive project documentation**: Overview, quick start guide, architecture, setup, deployment, API reference
- `CLAUDE.md` - This file: Guidance for Claude Code when working with the codebase
- `docs/SETUP_GUIDE.md` - Detailed setup with AWS/OpenAI configuration
- `docs/API_USAGE.md` - API endpoint examples and reference
- `docs/SAFETY_GUIDELINES.md` - **Critical**: Safety requirements and boundaries
- `docs/AWS_IAM_POLICY.md` - AWS S3 IAM policy configuration
