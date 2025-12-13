# AretaCare

**An AI care advocate for families navigating medical complexity.**

AretaCare helps you understand medical information, stay organized during hospital stays, and prepare meaningful questions for your healthcare team. It's the calm, steady partner families need when the medical system feels overwhelming.

---

## The Problem

When someone you love is hospitalized, information comes at you from everywhere. Doctors explain things during rounds. Nurses relay instructions that sometimes conflict. Specialists each share a piece of the puzzle. Radiology reports arrive full of terms you've never seen.

You find yourself taking notes at 2am, texting family members scattered across the country, and wishing you had a nurse practitioner in the family who could make sense of it all.

AretaCare was built from exactly this experience—sitting beside a loved one in a hospital room, trying to keep track of everything while feeling completely overwhelmed.

---

## What It Does

**Conversation** — Talk naturally about what's happening. Upload lab results, record voice notes, or type out questions. AretaCare helps translate medical jargon, organize information, and prepare you for conversations with the care team. Edit your own messages after sending to correct or clarify what you meant (edited messages are marked with an "(edited)" indicator). Copy any message to your clipboard as formatted text (markdown converts to rich HTML) for easy pasting into notes or documents. Contextual timestamps show time only for today's messages and date+time for older messages, helping you track when conversations occurred.

**Multi-Session Support** — Create up to 3 personal sessions to keep different care situations organized (e.g., separate sessions for different family members or health journeys). Switch between sessions using the header dropdown. Each session maintains its own conversations, documents, journal, and daily plans. Sessions can be renamed (15-character limit) and shared with others.

**Session Collaboration** — Invite family members to collaborate on a session. Up to 10 people can share the same view, keeping everyone informed and aligned even when you're in different cities. Manage all your collaborations from the dedicated Collaboration page—add or remove collaborators, transfer session ownership, track pending invitations, and leave shared sessions. Receive email notifications when collaborators are added or removed, and when ownership is transferred.

**Journal** — Your care journey automatically organized into a searchable timeline. Medical updates, treatment changes, appointments, insights, and milestones—all captured and categorized from your conversations so nothing falls through the cracks. Navigate by date using the sticky sidebar, jump to today with one click, and see future entries visually distinguished with blue shading. Entries are created with intelligent date interpretation (understands "Thursday", "next week", "yesterday").

**Daily Plan** — AI-generated summaries of today's priorities, important reminders, and questions to ask at your next appointment. Fully editable and regenerated daily based on your current situation. Each collaborator sees their own "new plan" notifications for independent tracking. Copy plans to your clipboard as formatted text for sharing with family or healthcare providers. Plans are generated from comprehensive context including all journal entries, recent conversations, latest documents, and previous plans.

**Documents** — AI-powered document manager with 12 categories for organizing medical records. Upload PDFs, images (PNG, JPG), and text files up to 20MB. Documents are automatically categorized by AI, text is extracted (PDFs via pypdf, images via OCR), and thumbnails are generated for quick preview. Search by content, navigate by date, and edit AI-generated descriptions (up to 200 characters). Journal entries are automatically created from meaningful uploads.

**Audio Recordings** — AI-powered audio manager with 12 categories for organizing voice notes and appointment recordings. Upload audio files (MP3, M4A, WAV, WebM, OGG) up to 20MB or record directly in the app with live waveform visualization and 15-minute countdown timer. Audio is automatically transcribed (using GPT-4o-transcribe), categorized by AI, and converted to browser-friendly MP3 format. Long files are automatically chunked for processing. Search by content, navigate by date, and edit AI-generated summaries (up to 150 characters).

**Specialized Tools** — Access dedicated tools for specific tasks: Jargon Translator (explains medical terminology with journal context, supports audio input), and Conversation Coach (helps prepare questions for healthcare teams, supports audio input with 15-minute recording limit).

**Account Security** — Comprehensive email notifications keep you informed of important account changes including password updates, email changes, session collaboration activities, and password reset requests. Password reset via email with time-limited tokens (1-hour expiration). JWT-based authentication with 7-day token expiration.

**Admin Console** — For administrators (configured via ADMIN_EMAILS): Timezone-aware metrics dashboard with interactive charts tracking users, sessions, documents, messages, errors, and security events. Tools include user management with search and activity tracking, inactive account detection, error logs with filtering and 30-day auto-cleanup, security logs, system health monitoring, S3 orphan file detection and cleanup, and audit logging with automatic retention (90 days default). All timestamps display in the admin's local timezone.

---

## Safety Boundaries

AretaCare is an advocate, not a clinician. It will never:

- Diagnose conditions or predict outcomes
- Recommend or adjust medications
- Dispute decisions made by your care team
- Give medical instructions

It will always defer to healthcare professionals and encourage you to confirm medical information with your care team.

---

## Quick Start

### Prerequisites

- Docker Desktop
- OpenAI API key
- AWS S3 bucket (for document storage)

### Setup

```bash
# Clone and configure
git clone <repository-url>
cd aretacare
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your credentials:

```env
# Required
OPENAI_API_KEY=sk-your-key
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
SECRET_KEY=generate-with-python-secrets

# Email (for password reset and notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=AretaCare
FRONTEND_URL=http://localhost:3001

# Admin (your email to access admin console)
ADMIN_EMAILS=your-email@example.com

# Optional
S3_KEY_PREFIX=dev/                    # For shared S3 buckets
AUDIT_LOG_RETENTION_DAYS=90          # Auto-delete audit logs (default: 90)
ERROR_LOG_RETENTION_DAYS=30          # Auto-delete error logs (default: 30)
RESET_DB=false                        # Set to "true" to reset database on startup
```

Generate a secret key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

See [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md) for Gmail app password setup.

### Run

```bash
docker compose up --build
```

Open http://localhost:3001 and create an account. You'll need to acknowledge four important notices during registration:
- AretaCare is not medical advice (AI assistance for understanding medical information)
- AretaCare is not a HIPAA-covered service (not an official medical record system)
- The system is in beta (potential instability and data loss)
- You'll receive email notifications for account security and collaboration activities

### Stop

```bash
docker compose down      # Stop services
docker compose down -v   # Stop and reset database
```

---

## Architecture

| Layer | Technology | Details |
|-------|------------|---------|
| Frontend | React 18, Vite, Tailwind CSS | Dark mode support, responsive design, code splitting for performance |
| Backend | FastAPI, SQLAlchemy, PostgreSQL | Auto-migrations, JWT auth with bcrypt, GZip compression |
| AI | OpenAI GPT-5.2, GPT-4o-transcribe | Responses API for chat and file analysis, native PDF/image support |
| Storage | AWS S3 | Presigned URLs (24-hour expiration), cascade cleanup, orphan detection |
| Deployment | Docker Compose, Render | Multi-service orchestration, production blueprint |

**Key Architecture Patterns:**
- **Multi-session support** - Each user owns up to 3 sessions, unlimited collaboration access
- **Session collaboration** - Up to 10 people per session (owner + 9 collaborators)
- **Cascade deletes** - User/session deletion removes all data including S3 files
- **Database migrations** - Auto-run on startup via `run_migrations()`
- **Centralized AI config** - All models, prompts, and safety boundaries in `backend/app/config/ai_config.py`
- **Email notifications** - SMTP integration for password reset, account changes, and collaboration
- **Security logging** - Invalid token tracking, IP logging, security event monitoring
- **Auto-cleanup** - Audit logs (90 days), error logs (30 days), expired invitations (30 days)

---

## Project Structure

```
aretacare/
├── backend/
│   └── app/
│       ├── api/              # FastAPI routes (auth, sessions, documents, audio, conversation, journal, daily plans, tools, admin)
│       ├── config/           # AI configuration (models, prompts, safety boundaries, categories)
│       ├── core/             # Auth utilities, migrations, config
│       ├── models/           # SQLAlchemy models (11 tables: users, sessions, collaborators, documents, audio, conversations, journal, daily plans, logs)
│       ├── schemas/          # Pydantic schemas for API validation
│       ├── services/         # Business logic (OpenAI, S3, document processing, email, admin, journal, daily plan)
│       └── main.py           # FastAPI app initialization
├── frontend/
│   └── src/
│       ├── pages/            # React pages (Conversation, Journal, DailyPlan, Collaboration, Settings, Documents, AudioRecordings, Tools, Admin)
│       ├── components/       # UI components (Header, MessageBubble, MessageInput, AudioWaveform, DailyPlanPanel, NetworkStatusBanner)
│       ├── contexts/         # State management (SessionContext, ThemeContext, AdminContext, NetworkContext)
│       ├── services/         # API client (axios with auth interceptor)
│       └── utils/            # Helper functions (date/timezone utilities)
├── docs/                     # Documentation (setup guides, API reference, safety guidelines, AWS/email configuration)
├── docker-compose.yml        # Multi-service orchestration
├── render.yaml               # Production deployment blueprint
└── CLAUDE.md                 # Development guidance for Claude Code
```

---

## Key Features

### Multi-Session Management
- Create up to **3 personal sessions** per user
- Switch sessions via header dropdown with active session indicator
- **Session naming** with 15-character limit (default: "Session 1/2/3" with smart numbering)
- Each session maintains separate: conversations, documents, journal entries, daily plans, audio recordings
- Delete individual sessions (removes all data including S3 files)

### Collaboration & Sharing
- Share sessions with **up to 10 people total** (1 owner + 9 collaborators)
- Dedicated **Collaboration page** (`/collaboration`) for managing all session sharing
- **Email invitations** for non-registered users (pending for 30 days)
- **Ownership transfer** with validation (target user must have <3 owned sessions)
- **Full collaborator access** to all session data (documents, conversations, journal, daily plans, audio)
- **Email notifications** for: collaborator added/removed, ownership transferred, invitation received
- Shared sessions **don't count** toward collaborator's 3-session ownership limit
- **Per-user view tracking** for daily plans (independent "new plan" notifications for each user)

### AI-Powered Features
- **Conversation interface** with GPT-5.2, "Thinking..." status, markdown rendering, copy-to-clipboard (converts markdown to formatted HTML)
- **Journal synthesis** - Automatically creates entries from conversations (6 entry types: medical update, treatment change, appointment, insight, milestone, other)
- **Daily plan generation** - AI-generated daily priorities, reminders, and questions based on comprehensive context
- **Document categorization** - 12 categories with AI-generated descriptions (user-editable, max 200 characters)
- **Audio categorization** - 12 categories with AI-generated summaries (user-editable, max 150 characters)
- **Jargon Translator** - Explains medical terminology with journal context, supports audio input
- **Conversation Coach** - Helps prepare questions for healthcare teams, supports audio input

### Document & Audio Management
- **Documents**: Upload PDFs, images (PNG, JPG), text files up to 20MB
  - Text extraction (PDFs via pypdf, images via Tesseract OCR)
  - Thumbnail generation for PDFs
  - Native GPT-5.2 file support via presigned URLs
  - Search by content, navigate by date
- **Audio**: Upload MP3, M4A, WAV, WebM, OGG up to 20MB or record in-app
  - Live waveform visualization with 15-minute countdown timer
  - Auto-transcription using GPT-4o-transcribe
  - Conversion to browser-friendly MP3 format
  - Automatic chunking for long files
  - Search by transcription, navigate by date

### Security & Privacy
- **JWT-based authentication** with 7-day token expiration
- **Bcrypt password hashing** with 8-character minimum
- **Password reset** via email with time-limited tokens (1-hour expiration)
- **Email notifications** for: password changes, email changes, collaborator activities, password reset requests
- **Security logging** - Invalid token attempts, IP tracking, user agent logging
- **Cascade deletes** - User/session deletion removes all data including S3 files (zero orphaned files)

### Admin Console
Requires email in `ADMIN_EMAILS` environment variable. Features include:
- **Timezone-aware metrics dashboard** with interactive charts (users, sessions, documents, messages, errors, security)
- **User management** with search and activity tracking
- **Inactive account detection** and email notifications
- **Error logs** with filtering and 30-day auto-cleanup
- **Security logs** for monitoring authentication attempts
- **System health monitoring**
- **S3 orphan file detection** and cleanup
- **Audit logging** with automatic retention (90 days default)

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Development guidance for Claude Code (architecture, features, AI configuration) |
| [SECURITY.md](SECURITY.md) | Security vulnerability reporting |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Detailed AWS and OpenAI configuration |
| [docs/API_USAGE.md](docs/API_USAGE.md) | API endpoint reference with examples |
| [docs/SAFETY_GUIDELINES.md](docs/SAFETY_GUIDELINES.md) | AI safety requirements and boundaries |
| [docs/AWS_IAM_POLICY.md](docs/AWS_IAM_POLICY.md) | Required S3 permissions for document storage |
| [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md) | Email notification configuration (Gmail SMTP setup) |
| [backend/app/config/README.md](backend/app/config/README.md) | AI configuration guide (models, prompts, categories) |

---

## Deployment

AretaCare deploys to Render using the included `render.yaml` blueprint:

1. Push to GitHub
2. Connect repository in Render dashboard
3. Add environment variables:
   - **Required**: `OPENAI_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `ADMIN_EMAILS`
   - **Optional**: `S3_KEY_PREFIX` (for shared S3 buckets), `AUDIT_LOG_RETENTION_DAYS`, `ERROR_LOG_RETENTION_DAYS`
   - **Auto-configured**: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`
4. Deploy

The blueprint configures:
- **PostgreSQL database** with auto-migrations on startup
- **FastAPI backend** (Python 3.11) with system dependencies (tesseract-ocr, poppler-utils, ffmpeg)
- **React frontend** (static site) served via Vite build

**Database migrations** run automatically on startup via `run_migrations()` in `backend/app/core/migrations.py`.

---

## License

MIT, with additional restrictions under the Commons Clause.  
See `LICENSE` and `COMMONS-CLAUSE.md` for details.

---

*Built with care for families navigating the healthcare system.*
