# AretaCare - Your Family's AI Care Advocate

AretaCare is an AI-powered care advocate assistant that helps families navigate complex medical information with clarity, compassion, and confidence. It provides an interactive conversation interface with AI-powered journal synthesis, medical document analysis, and specialized tools for understanding healthcare information.

## Features

### Core Application
- **Conversation Interface**: Primary chat interface with AI care advocate
- **Multi-Session Support**: Up to 3 active sessions per user (including shared sessions) to organize different care scenarios, with session switcher in header dropdown and renameable sessions (up to 15 characters)
- **Session Sharing**: Share sessions with family members or caregivers by email (up to 5 people per session), collaborators have full access to session data, owners control sharing permissions
- **Daily Plan**: AI-generated daily summaries with priorities, reminders, and questions for care team (user editable, delete/regenerate support)
- **AI Journal Synthesis**: Automatically extracts and organizes key medical updates from conversations
- **Journal with Date Navigation**: Reverse chronological order with date selector sidebar and scroll-to-date functionality
- **AI-Powered Documents Manager**: Upload PDFs, images, or text files with automatic AI categorization (12 categories), searchable AI-generated descriptions, and date-based organization
- **AI-Powered Audio Recordings**: Voice notes with automatic transcription, AI categorization (12 categories), searchable summaries, and date-based organization

### Specialized Tools
- **Jargon Translator**: Translate complex medical terminology into simple, understandable language
- **Conversation Coach**: Prepare for healthcare appointments with suggested questions and conversation tips

### Security & Privacy
- **User Authentication**: Secure JWT-based authentication with bcrypt password hashing
- **Settings Page**: Account management with password-verified updates, password reset via email, session management, and account deletion
- **Secure Storage**: Medical documents stored in AWS S3 with encrypted transmission
- **Complete Data Deletion**: Session and account deletion removes all data including S3 files (zero orphaned data)
- **Password Reset**: Secure email-based password reset with 1-hour token expiration

## Safety Boundaries

AretaCare maintains strict safety boundaries:

**Never:**
- Diagnoses medical conditions
- Recommends or adjusts medications
- Predicts medical outcomes
- Disputes clinician decisions
- Gives medical instructions

**Always:**
- Defers final authority to clinicians
- Encourages users to confirm medical meaning with care professionals
- Maintains calm, respectful, and neutral tone
- Only summarizes provided information - never invents medical facts

## Quick Start Guide

Get AretaCare running locally in 5 minutes!

### Prerequisites

- Docker Desktop installed and running
- OpenAI API Key
- AWS S3 bucket configured

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd aretacare
   ```

2. **Configure Backend Environment**
   ```bash
   cp backend/.env.example backend/.env
   ```

   Edit `backend/.env` and add your credentials:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   S3_BUCKET_NAME=your-bucket
   SECRET_KEY=generate-random-string
   ```

   Generate a secret key:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   **Important**: Your AWS IAM user must have the correct S3 permissions. See `docs/AWS_IAM_POLICY.md` for the required policy.

   **Optional - Email Configuration**: To enable password reset emails, configure SMTP settings. See `docs/EMAIL_SETUP.md` for setup instructions.

3. **Start the Application**
   ```bash
   docker compose up --build
   ```

   Wait for all services to start (about 2-3 minutes).

4. **Access AretaCare**
   - **Frontend**: http://localhost:3001
   - **API Docs**: http://localhost:8000/docs
   - **Health Check**: http://localhost:8000/health

5. **First-Time Setup**
   - Navigate to http://localhost:3001
   - Click "Create account" to register
   - Fill in name, email, and password (8-72 characters)
   - You'll be automatically logged in and redirected to the conversation interface

### Stopping the Application

```bash
docker compose down
```

To reset the database completely:
```bash
docker compose down -v
```

## Architecture

### Technology Stack

**Backend**
- **Framework**: FastAPI 0.104.1
- **Database**: PostgreSQL 15 with SQLAlchemy 2.0
- **AI**: OpenAI GPT-5.1 with Responses API (GPT-4o for transcription)
  - All AI configuration centralized in `backend/app/config/ai_config.py`
  - See `backend/app/config/README.md` for AI configuration guide
- **Storage**: AWS S3 with boto3
- **Document Processing**: PyPDF2, Pillow, pytesseract (OCR), ffmpeg (audio)
- **Authentication**: JWT (python-jose), bcrypt (passlib)

**Frontend**
- **Framework**: React 18
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3
- **Routing**: React Router 6
- **HTTP Client**: Axios

**Infrastructure**
- **Database**: PostgreSQL 15
- **Storage**: AWS S3
- **Container**: Docker & Docker Compose
- **Deployment**: Render (production)

### Multi-Service Application

**Backend (FastAPI)**
- Lives in `backend/app/`
- Auto-creates database tables on startup via SQLAlchemy
- API routes mounted at `/api` prefix
- All routes return JSON, documented at `/docs`

**Frontend (React + Vite)**
- Lives in `frontend/src/`
- Uses relative API URLs (`/api`) to leverage Vite's proxy in Docker
- Session management via `SessionContext` stores session ID in localStorage
- Auth token automatically included in API requests via axios interceptor

**Database (PostgreSQL)**
- Eight main tables: `users`, `sessions`, `session_collaborators`, `documents`, `audio_recordings`, `conversations`, `journal_entries`, `daily_plans`
- Cascading deletes: deleting user removes all associated data
- Sessions expire after 60 minutes of inactivity

**Storage (AWS S3)**
- Medical documents uploaded to S3 with unique keys
- PDF thumbnails automatically generated and stored
- Audio recordings stored with metadata
- Text extraction on upload (PDF, images via OCR)
- Presigned URLs for secure document access (24-hour expiration)
- Complete cleanup on session deletion

## Project Structure

```
aretacare/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py              # Authentication endpoints
│   │   │   ├── sessions.py          # Session management & sharing
│   │   │   ├── permissions.py       # Permission checking helpers
│   │   │   ├── documents.py         # Document upload/management
│   │   │   ├── audio_recording.py   # Audio recording management
│   │   │   ├── conversation.py      # Conversation endpoints
│   │   │   ├── journal.py           # Journal CRUD operations
│   │   │   ├── daily_plans.py       # Daily plan management
│   │   │   └── tools.py             # Standalone tools
│   │   ├── config/
│   │   │   ├── ai_config.py         # All AI prompts & safety boundaries
│   │   │   └── README.md            # AI configuration guide
│   │   ├── core/
│   │   │   ├── auth.py              # JWT & password hashing
│   │   │   ├── config.py            # Environment configuration
│   │   │   ├── database.py          # Database connection
│   │   │   └── migrations.py        # Database migrations
│   │   ├── models/                  # SQLAlchemy models
│   │   ├── schemas/                 # Pydantic schemas
│   │   ├── services/
│   │   │   ├── openai_service.py    # GPT-5.1 integration
│   │   │   ├── journal_service.py   # Journal synthesis logic
│   │   │   ├── daily_plan_service.py # Daily plan generation
│   │   │   ├── s3_service.py        # AWS S3 operations
│   │   │   └── document_processor.py # PDF/OCR processing
│   │   └── main.py                  # FastAPI application
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx           # Navigation with session switcher
│   │   │   ├── MessageBubble.jsx    # Chat message display
│   │   │   ├── MessageInput.jsx     # Chat input with file upload
│   │   │   ├── CollaborationModal.jsx # Session sharing UI
│   │   │   ├── DailyPlan/           # Daily plan components
│   │   │   └── Journal/             # Journal components
│   │   ├── contexts/
│   │   │   └── SessionContext.jsx   # Session & auth state
│   │   ├── pages/
│   │   │   ├── Conversation.jsx     # Main chat interface
│   │   │   ├── JournalView.jsx      # Full journal page
│   │   │   ├── DailyPlan.jsx        # Daily plan history
│   │   │   ├── AudioRecordings.jsx  # Audio recordings manager
│   │   │   ├── Settings.jsx         # Account settings
│   │   │   └── tools/
│   │   │       ├── Documents.jsx    # Document manager
│   │   │       ├── JargonTranslator.jsx
│   │   │       └── ConversationCoach.jsx
│   │   ├── services/
│   │   │   └── api.js               # Axios with auth interceptors
│   │   └── App.jsx                  # Router configuration
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.js
├── docs/
│   ├── SETUP_GUIDE.md
│   ├── API_USAGE.md
│   ├── SAFETY_GUIDELINES.md
│   ├── AWS_IAM_POLICY.md
│   └── EMAIL_SETUP.md
├── docker-compose.yml
├── render.yaml                      # Render Blueprint
├── CLAUDE.md                        # Claude Code guidance
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Sessions
- `POST /api/sessions/` - Create session
- `POST /api/sessions/primary` - Get or create primary session
- `GET /api/sessions/{id}` - Get session
- `PATCH /api/sessions/{id}/rename` - Rename session (owner only)
- `DELETE /api/sessions/{id}` - Delete session (owner only)
- `POST /api/sessions/{id}/share` - Share session with another user
- `DELETE /api/sessions/{id}/collaborators/{user_id}` - Revoke collaborator access
- `POST /api/sessions/{id}/leave` - Leave a shared session

### Documents
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/session/{id}` - Get session documents
- `GET /api/documents/{id}/download-url` - Get presigned download URL
- `DELETE /api/documents/{id}` - Delete document

### Conversation
- `POST /api/conversation/message` - Send message
- `GET /api/conversation/{session_id}/history` - Get conversation history

### Journal
- `GET /api/journal/{session_id}` - Get journal entries (grouped by date)
- `POST /api/journal/{session_id}` - Create journal entry
- `PUT /api/journal/{entry_id}` - Update journal entry
- `DELETE /api/journal/{entry_id}` - Delete journal entry

### Daily Plans
- `GET /api/daily-plans/{session_id}` - Get all daily plans
- `POST /api/daily-plans/{session_id}/generate` - Generate new daily plan
- `PUT /api/daily-plans/{plan_id}` - Update daily plan
- `DELETE /api/daily-plans/{plan_id}` - Delete daily plan

### Standalone Tools
- `POST /api/tools/jargon-translator` - Translate medical jargon
- `POST /api/tools/conversation-coach` - Get conversation coaching

## Development

### Docker Commands

```bash
# Start all services
docker compose up --build

# Stop services
docker compose down

# Stop and remove volumes (reset database)
docker compose down -v

# View logs
docker compose logs -f backend

# Restart individual services
docker compose restart backend
```

### Environment Variables

**Backend** (`backend/.env`):
- `OPENAI_API_KEY` - For GPT-5.1 interactions
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` - For document storage
- `DATABASE_URL` - Auto-configured in Docker Compose
- `SECRET_KEY` - For JWT signing
- `CORS_ORIGINS` - Comma-separated allowed origins
- `RESET_DB` - Set to "true" to drop and recreate database on startup

### Package Version Constraints

**Critical Python Packages** (in `backend/requirements.txt`):
- `httpx<0.28.0` - Version 0.28+ breaks OpenAI client
- `bcrypt<5.0.0` - Version 5.x incompatible with passlib 1.7.4

## Production Deployment

### Deploy to Render

1. **Push code to GitHub**

2. **Deploy using Blueprint**
   - Go to https://render.com
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will detect `render.yaml` and create all services

3. **Configure Environment Variables**

   In the Render dashboard for `aretacare-backend`, add:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `AWS_ACCESS_KEY_ID` - Your AWS access key
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
   - `S3_BUCKET_NAME` - Your S3 bucket name

4. **Deploy**
   - Click "Apply" to deploy all services
   - Access your app at the frontend URL

## Troubleshooting

### Services won't start
```bash
docker compose down -v
docker compose up --build
```

### Backend errors
```bash
docker compose logs backend
curl http://localhost:8000/health
```

### AWS S3 Permissions
If you see AccessDenied errors, check `docs/AWS_IAM_POLICY.md` for required IAM policy.

## Documentation

- `CLAUDE.md` - Guidance for Claude Code development
- `docs/SETUP_GUIDE.md` - Detailed setup with AWS/OpenAI configuration
- `docs/API_USAGE.md` - API endpoint examples
- `docs/SAFETY_GUIDELINES.md` - **Critical**: Safety requirements and boundaries
- `docs/AWS_IAM_POLICY.md` - AWS S3 IAM policy configuration

## Safety Guidelines

**Read `docs/SAFETY_GUIDELINES.md` before modifying any LLM-related code.**

Any code changes that modify AI prompts, services, or how medical information is presented must be reviewed against safety guidelines.

## License

MIT License - See [LICENSE](LICENSE) file for details

---

Built with care for families navigating the healthcare system.
