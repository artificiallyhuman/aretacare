# AretaCare - Your Family's AI Care Advocate

AretaCare is an AI-powered care advocate assistant that helps families navigate complex medical information with clarity, compassion, and confidence. It provides an interactive conversation interface with AI-powered journal synthesis, medical document analysis, and specialized tools for understanding healthcare information.

## Features

### Core Application
- **Conversation Interface**: Primary chat interface with AI care advocate, "Thinking..." status during processing
- **Multi-Session Support**: Each user can have up to 3 active sessions (including shared sessions) to organize different care scenarios, with session switcher in header dropdown, automatic naming "Session 1/2/3" (renameable up to 15 characters with character counter), and instant session switching
- **Session Sharing**: Share sessions with family members or caregivers by email (up to 5 people per session), collaborators have full access to session data, owners control sharing permissions
- **Enhanced Markdown Rendering**: Custom formatted messages with proper spacing, color-aware styling, and clean typography
- **Daily Plan**: AI-generated daily summaries with priorities, reminders, and questions for care team (auto-generates after 2 AM, user editable, delete/regenerate support)
- **AI Journal Synthesis**: Automatically extracts and organizes key medical updates with accurate timezone handling
- **Journal with Date Navigation**: Reverse chronological order, sticky sidebar with date selector, scroll-to-date functionality, entry types include appointment, symptom, medication, test_result, milestone, note, and other
- **AI-Powered Documents Manager**: Upload PDFs, images, or text files with automatic AI categorization (12 categories), searchable AI-generated descriptions, date-based organization with sticky sidebar, scroll-to-date navigation (matching Journal page), mobile-responsive collapsible sidebar, and thumbnail previews
- **AI-Powered Audio Recordings**: Voice notes with automatic transcription, AI categorization (12 categories), searchable summaries, date-based organization with sticky sidebar, scroll-to-date navigation (matching Journal page), mobile-responsive collapsible sidebar, and audio playback
- **Smart Scrolling**: Auto-scroll stops at message input box (not footer), only when user is near bottom

### Specialized Tools
- **Jargon Translator**: Translate complex medical terminology into simple, understandable language with audio input and waveform visualization
- **Conversation Coach**: Prepare for healthcare appointments with suggested questions, conversation tips, voice recording, and live waveform feedback
- **Documents Manager**: AI-categorized document library with search, filtering by 12 categories (lab results, imaging reports, clinic notes, etc.), sticky sidebar with date selector, and scroll-to-date navigation
- **Audio Recordings**: Transcribed voice notes with AI categorization by 12 types (symptom updates, appointment recaps, medication notes, etc.), search, filtering, sticky sidebar with date selector, and scroll-to-date navigation
- **About Page**: Tabbed interface with "The Platform" (feature descriptions) and "The Story" (origin story) sections
- **Legal Pages**: Professional Terms of Service and Privacy Policy with clear formatting, warning boxes, and GitHub repository links

### Security & Privacy
- **User Authentication**: Secure JWT-based authentication with bcrypt password hashing
- **Settings Page**: Secure account management with password-verified updates (name, email, password), password reset via email with time-limited tokens, manage sessions (rename/view statistics/delete individual sessions), and complete account deletion
- **Multi-Session Management**: Up to 3 sessions per user (owned + shared), each with isolated data (conversations, journal, documents, audio, daily plans), session switcher in header dropdown, smart session naming with gap-filling
- **Session Sharing Controls**: Only session owners can share, rename, or delete sessions; collaborators can view and contribute to shared data; users can leave shared sessions at any time
- **Secure Storage**: Medical documents stored in AWS S3 with encrypted transmission
- **Complete Data Deletion**: Individual session deletion removes all PostgreSQL data and S3 files (documents, thumbnails, audio recordings), account deletion removes all sessions and files with zero orphaned data
- **Data Control**: Users can delete individual sessions or entire account at any time
- **Password Reset**: Secure email-based password reset with 1-hour token expiration
- **Transparent Policies**: Clear Terms of Service and Privacy Policy available on all auth screens and in footer

### User Experience
- **Professional UI**: Clean, modern interface with intuitive navigation and organized content structure
- **Mobile Optimized**: Native app-like feel with compact sizing, touch-friendly buttons, collapsible sidebars on Documents and Audio pages, collapsible Tools submenu, and reduced padding throughout
- **Disclaimer Placement**: Shown only on login/register screens, keeping the main interface clean and uncluttered
- **Smart Navigation**: Clickable user name/avatar in header opens session dropdown with all sessions, "New Session" button, and Settings access, collapsible Tools submenu on mobile
- **Smart UI Behavior**: Click-away dropdown menus, smooth transitions, and responsive feedback
- **Enhanced Content Organization**: Feature descriptions with intro sentences followed by organized bullet points
- **Clear Onboarding**: Welcome instructions directing users to conversation input with example topics

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

   **Important**: Your AWS IAM user must have the correct S3 permissions. See `docs/AWS_IAM_POLICY.md` for the required policy. The IAM user needs these permissions:
   - `s3:PutObject` - Upload documents
   - `s3:GetObject` - Download documents
   - `s3:DeleteObject` - Delete documents
   - `s3:PutObjectAcl` - Set object permissions

   **Optional - Email Configuration**: To enable password reset emails, configure SMTP settings in `backend/.env`:
   ```env
   SMTP_PASSWORD=your_gmail_app_password_here
   FRONTEND_URL=http://localhost:3001
   ```

   See `docs/EMAIL_SETUP.md` for complete Gmail App Password setup instructions. Without this configuration, password reset links will be logged to backend console (development mode).

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

### Sample Medical Text for Testing

Use this sample text to test the Medical Summary tool:

```
Patient: John Doe
Date: 2025-01-15

Chief Complaint: Follow-up for hypertension

Vital Signs:
- BP: 142/88 mmHg
- HR: 78 bpm
- Temp: 98.6°F

Assessment:
Blood pressure remains elevated despite current medication (Lisinopril 10mg daily).
Patient reports good medication compliance.

Plan:
1. Increase Lisinopril to 20mg daily
2. Continue low-sodium diet
3. Follow-up in 4 weeks
4. Home BP monitoring recommended
```

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
  - Includes models, prompts, safety boundaries, categories, and context limits
  - See `backend/app/config/README.md` for AI configuration guide
- **Storage**: AWS S3 with boto3
- **Document Processing**: PyPDF2, Pillow, pytesseract (OCR), ffmpeg (audio)
- **Authentication**: JWT (python-jose), bcrypt (passlib)
- **Server**: Uvicorn with async support

**Frontend**
- **Framework**: React 18
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3
- **Routing**: React Router 6
- **HTTP Client**: Axios
- **Markdown**: react-markdown

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
- JWT-based authentication with Bearer token in Authorization header
- Password hashing with bcrypt (version <5.0.0 for passlib compatibility)

**Frontend (React + Vite)**
- Lives in `frontend/src/`
- Uses relative API URLs (`/api`) to leverage Vite's proxy in Docker
- Session management via `useSession` hook stores session ID in localStorage
- User authentication with JWT tokens stored in localStorage
- Auth token automatically included in API requests via axios interceptor
- Protected routes redirect to login if not authenticated
- Custom ReactMarkdown components for enhanced message rendering with color-aware styling

**Database (PostgreSQL)**
- Eight main tables: `users`, `sessions`, `session_collaborators`, `documents`, `audio_recordings`, `conversations`, `journal_entries`, `daily_plans`
- User table stores authentication credentials (bcrypt hashed passwords)
- Sessions tied to user accounts via foreign key with separate `owner_id` for ownership tracking
- Session collaborators table for sharing sessions between users
- Journal entries with AI-generated content and metadata
- Daily plans with AI-generated content, user edits, and viewed status
- Cascading deletes: deleting user removes all associated data
- Sessions expire after 60 minutes of inactivity

**Storage (AWS S3)**
- Medical documents uploaded to S3 with unique keys
- PDF thumbnails automatically generated and stored for visual preview
- Audio recordings stored with metadata for playback and transcription
- Text extraction happens on upload (PDF, images via OCR)
- Extracted text stored in database for quick access
- Presigned URLs generated for secure document access (24-hour expiration)
- Native GPT-5.1 file support for PDFs and images
- Complete cleanup on session deletion (documents, thumbnails, audio files)

### Key Architecture Features

**Conversation-First Design**
- Main interface is a chat conversation with AI care advocate
- Journal panel hidden by default; opens as sidebar on desktop or modal on mobile
- Welcome page with clear onboarding instructions directing users to message box
- Messages can include text, documents, images, and voice recordings
- Enhanced markdown rendering with custom components for clean, readable formatting
- Smart auto-scroll behavior with manual scroll button (only when messages exist)
- Compact message spacing for better conversation flow
- Conversation history persists across sessions
- Separate start/stop buttons for audio recording with visual feedback

**AI Journal Synthesis**
- Automatically analyzes conversations for medical significance
- Creates structured journal entries with titles, content, and metadata
- Organizes entries by date with reverse chronological display
- Supports manual entry creation, editing, and deletion
- Entry types: appointment, symptom, medication, test_result, milestone, note, other

**GPT-5.1 Native File Support**
- Documents and images passed directly to OpenAI API
- Presigned S3 URLs used for secure access
- Supports PDFs, images (PNG, JPG), and text files
- OCR text extraction as fallback for older models

**Smart UI Behavior**
- Click-away dropdown menus (tools menu)
- Smart scrolling: only auto-scroll if user is near bottom
- Scroll-to-bottom button appears when user scrolls up
- Responsive design with mobile hamburger menu (lg breakpoint)
- Mobile journal appears as full-screen modal overlay
- Image previews and PDF thumbnails in Documents page with thumbnail grid
- Live audio waveform visualization during recording for immediate feedback
- Complete S3 cleanup when clearing session (documents, thumbnails, audio files)
- Professional legal pages with gradient backgrounds, warning boxes, and clear formatting

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
- `DELETE /api/sessions/{id}` - Delete session (owner only, removes all PostgreSQL data and S3 files)
- `POST /api/sessions/{id}/cleanup` - Cleanup session data
- `POST /api/sessions/{id}/check-user` - Check if user exists for sharing
- `POST /api/sessions/{id}/share` - Share session with another user (owner only)
- `DELETE /api/sessions/{id}/collaborators/{user_id}` - Revoke collaborator access (owner only)
- `POST /api/sessions/{id}/leave` - Leave a shared session (collaborators only)

### Documents
- `POST /api/documents/upload` - Upload document (auto-generates PDF thumbnails)
- `GET /api/documents/session/{id}` - Get session documents
- `GET /api/documents/{id}` - Get document details
- `GET /api/documents/{id}/thumbnail-url` - Get presigned thumbnail URL (for PDFs)
- `DELETE /api/documents/{id}` - Delete document (removes document and thumbnail from S3)
- `GET /api/documents/{id}/download-url` - Get presigned download URL

### Conversation
- `POST /api/conversation/message` - Send message (with optional document/image)
- `GET /api/conversation/{session_id}/history` - Get conversation history with rich media

### Journal
- `GET /api/journal/{session_id}` - Get journal entries (grouped by date)
- `GET /api/journal/{session_id}/date/{date}` - Get entries for specific date
- `POST /api/journal/{session_id}` - Create journal entry
- `PUT /api/journal/{entry_id}` - Update journal entry
- `DELETE /api/journal/{entry_id}` - Delete journal entry

### Daily Plans
- `GET /api/daily-plans/{session_id}` - Get all daily plans (most recent first)
- `GET /api/daily-plans/{session_id}/latest` - Get latest daily plan
- `GET /api/daily-plans/{session_id}/check` - Check if new plan should be generated
- `POST /api/daily-plans/{session_id}/generate` - Generate new daily plan (requires sufficient data)
- `PUT /api/daily-plans/{plan_id}` - Update daily plan (user edits)
- `PUT /api/daily-plans/{plan_id}/mark-viewed` - Mark plan as viewed
- `DELETE /api/daily-plans/{plan_id}` - Delete daily plan

### Standalone Tools
- `POST /api/tools/jargon-translator` - Translate medical jargon
- `POST /api/tools/conversation-coach` - Get conversation coaching

## Project Structure

```
aretacare/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py      # API router aggregation
│   │   │   ├── auth.py          # Authentication endpoints
│   │   │   ├── sessions.py      # Session management & sharing
│   │   │   ├── permissions.py   # Permission checking helpers
│   │   │   ├── documents.py     # Document upload/management
│   │   │   ├── conversation.py  # Conversation endpoints
│   │   │   ├── journal.py       # Journal CRUD operations
│   │   │   ├── daily_plans.py   # Daily plan management
│   │   │   └── tools.py         # Standalone tools
│   │   ├── core/
│   │   │   ├── auth.py          # JWT & password hashing
│   │   │   ├── config.py        # Environment configuration
│   │   │   └── database.py      # Database connection
│   │   ├── models/
│   │   │   ├── user.py          # User model with authentication
│   │   │   ├── session.py       # Session model with owner tracking
│   │   │   ├── session_collaborator.py  # Session sharing model
│   │   │   ├── document.py      # Document model
│   │   │   ├── conversation.py  # Conversation history
│   │   │   ├── journal.py       # Journal entries
│   │   │   └── daily_plan.py    # Daily plans
│   │   ├── schemas/
│   │   │   ├── auth.py          # Auth request/response schemas
│   │   │   ├── conversation.py  # Message schemas with rich media
│   │   │   ├── journal.py       # Journal entry schemas
│   │   │   └── ...              # Other schemas
│   │   ├── services/
│   │   │   ├── openai_service.py       # GPT-5.1 integration (CRITICAL)
│   │   │   ├── journal_service.py      # Journal synthesis logic
│   │   │   ├── daily_plan_service.py   # Daily plan generation
│   │   │   ├── s3_service.py           # AWS S3 operations
│   │   │   └── document_processor.py   # PDF/OCR processing
│   │   └── main.py              # FastAPI application
│   ├── Dockerfile               # Local development
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx           # Responsive nav with tools dropdown (About after Tools)
│   │   │   ├── Disclaimer.jsx       # Safety disclaimer
│   │   │   ├── MessageBubble.jsx    # Chat message display with custom markdown rendering
│   │   │   ├── MessageInput.jsx     # Chat input with file upload and audio recording
│   │   │   ├── CollaborationModal.jsx  # Session sharing UI
│   │   │   └── Journal/
│   │   │       ├── JournalPanel.jsx # Collapsible journal sidebar
│   │   │       ├── JournalEntry.jsx # Individual entry display
│   │   │       └── EntryForm.jsx    # Add/edit entry form
│   │   ├── pages/
│   │   │   ├── Login.jsx            # Login page
│   │   │   ├── Register.jsx         # Registration page
│   │   │   ├── Conversation.jsx     # Main conversation interface
│   │   │   ├── About.jsx            # About page with feature descriptions
│   │   │   ├── JournalView.jsx      # Full journal page view
│   │   │   ├── DailyPlan.jsx        # Daily plan page with history
│   │   │   ├── AudioRecordings.jsx  # Audio recordings manager
│   │   │   └── tools/
│   │   │       ├── JargonTranslator.jsx  # Jargon translator tool
│   │   │       ├── ConversationCoach.jsx # Conversation coach tool
│   │   │       └── Documents.jsx         # Document manager
│   │   ├── services/
│   │   │   └── api.js               # Axios with auth interceptors
│   │   ├── hooks/
│   │   │   └── useSession.js        # Session & auth state
│   │   ├── styles/
│   │   │   └── index.css            # Tailwind CSS
│   │   ├── App.jsx                  # Router configuration
│   │   └── main.jsx                 # Entry point
│   ├── Dockerfile                   # Local development
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── docs/
│   ├── SETUP_GUIDE.md               # Detailed setup instructions
│   ├── API_USAGE.md                 # API endpoint examples
│   ├── SAFETY_GUIDELINES.md         # Safety requirements
│   └── AWS_IAM_POLICY.md            # S3 IAM policy config
├── Dockerfile                       # Production backend (Render)
├── docker-compose.yml               # Local development
├── render.yaml                      # Render Blueprint
├── CLAUDE.md                        # Claude Code guidance
└── README.md                        # This file
```

## Development

### Docker Commands

```bash
# Start all services
docker compose up --build

# Start in detached mode
docker compose up -d

# Stop services
docker compose down

# Stop and remove volumes (reset database)
docker compose down -v

# View logs
docker compose logs backend
docker compose logs frontend
docker compose logs -f backend    # Follow logs

# Restart individual services
docker compose restart backend
docker compose restart frontend

# Rebuild specific service
docker compose up -d --build backend
```

### Environment Variables

**Backend** (`backend/.env`):
- `OPENAI_API_KEY` - For GPT-5.1 interactions
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` - For document storage
- `DATABASE_URL` - Auto-configured in Docker Compose
- `SECRET_KEY` - For JWT signing
- `CORS_ORIGINS` - Comma-separated allowed origins
- `RESET_DB` - Set to "true" to drop and recreate database on startup (development only)

**Frontend** (`frontend/.env`):
- `VITE_API_URL` - Override API URL (defaults to `/api`)

### Package Version Constraints

**System Dependencies** (in Dockerfile):
- `tesseract-ocr` - OCR engine for extracting text from images
- `poppler-utils` - Required for PDF thumbnail generation
- `ffmpeg` - Required for audio transcription and processing

**Python Packages** (in `backend/requirements.txt`):
- `httpx<0.28.0` - Version 0.28+ breaks OpenAI client
- `openai>=1.56.0` - Earlier versions have httpx incompatibility
- `pytesseract==0.3.10` - Python wrapper for tesseract-ocr
- `pdf2image==1.16.3` - PDF to image conversion for thumbnail generation
- `bcrypt<5.0.0` - **CRITICAL**: Version 5.x incompatible with passlib 1.7.4
- `passlib[bcrypt]==1.7.4` - Password hashing
- `python-jose[cryptography]==3.3.0` - JWT token creation/validation

## Production Deployment

### Deploy to Render

1. **Push code to GitHub**

2. **Deploy using Blueprint**
   - Go to https://render.com
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will detect `render.yaml` and create:
     - `aretacare-db` - PostgreSQL database (basic plan)
     - `aretacare-backend` - FastAPI web service (starter plan)
     - `aretacare-frontend` - React static site

3. **Configure Environment Variables**

   In the Render dashboard for `aretacare-backend`, add:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `AWS_ACCESS_KEY_ID` - Your AWS access key
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
   - `S3_BUCKET_NAME` - Your S3 bucket name

   Auto-configured variables:
   - `DATABASE_URL` - Auto-injected from database
   - `SECRET_KEY` - Auto-generated
   - `CORS_ORIGINS` - Set to frontend URL

4. **Deploy**
   - Click "Apply" to deploy all services
   - Wait for services to be live
   - Access your app at the frontend URL

### Database Management

To reset the database schema in production:
1. Add environment variable `RESET_DB=true` to backend service
2. Redeploy backend service
3. **IMPORTANT**: Remove `RESET_DB` variable after deployment completes
4. Redeploy again to ensure normal operation

**WARNING**: `RESET_DB=true` will delete ALL data in the database!

### Important Files for Production
- `Dockerfile` (root) - Production backend build
- `backend/Dockerfile` - Local development only
- `frontend/Dockerfile` - Local development only
- `render.yaml` - Blueprint configuration

## Troubleshooting

### Services won't start
```bash
docker compose down -v
docker system prune -a
docker compose up --build
```

### Can't reach frontend
```bash
# Check if containers are running
docker compose ps

# Verify port is not in use
lsof -i :3001
```

### Backend errors
```bash
# Check logs
docker compose logs backend

# Test backend directly
curl http://localhost:8000/health
```

### Database issues
```bash
# Reset database
docker compose down -v && docker compose up
```

### AWS S3 Permissions
If you see AccessDenied errors:
1. Check `docs/AWS_IAM_POLICY.md` for required IAM policy
2. Verify your IAM user has all required S3 permissions
3. Ensure S3 bucket name matches `.env` configuration

## Security Features

- **CORS Protection**: Restricted origins
- **Input Validation**: Pydantic schemas
- **File Type Validation**: Whitelist of allowed types
- **File Size Limits**: 10MB maximum
- **SQL Injection Protection**: SQLAlchemy ORM
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salting
- **Environment Variables**: Sensitive data in `.env`
- **Session Expiration**: Automatic cleanup
- **S3 Private Buckets**: No public access

## Cost Considerations

### Estimated Monthly Costs (Production)

- **Render Services**: $25-50/month (Starter plans)
- **PostgreSQL**: Included with Render
- **AWS S3**: $1-5/month (based on usage)
- **OpenAI API**: Variable ($10-100+ based on usage)
- **Total**: ~$40-160/month

### Cost Optimization
- Set OpenAI usage limits
- Clean up old sessions and documents
- Optimize S3 lifecycle policies
- Monitor API usage

## Documentation

- `README.md` - This file (project overview and setup)
- `CLAUDE.md` - Guidance for Claude Code development
- `docs/SETUP_GUIDE.md` - Detailed setup with AWS/OpenAI configuration
- `docs/API_USAGE.md` - API endpoint examples and reference
- `docs/SAFETY_GUIDELINES.md` - **Critical**: Safety requirements and boundaries
- `docs/AWS_IAM_POLICY.md` - AWS S3 IAM policy configuration

## Safety Guidelines

**Read `docs/SAFETY_GUIDELINES.md` before modifying any LLM-related code.**

The application's core value proposition is maintaining safety boundaries. Any code changes that:
- Modify `openai_service.py`
- Add new LLM features
- Change how medical information is presented

Must be reviewed against safety guidelines to ensure:
- No diagnosis or treatment recommendations
- No outcome predictions
- Deference to medical professionals
- Calm, professional tone maintained

## Support

For support or questions:
1. Check API documentation at `/docs`
2. Review this README and other documentation in `/docs`
3. Check logs: `docker compose logs [service-name]`
4. Contact the development team

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

Built with care for families navigating medical information.

**Technologies**: FastAPI, React, PostgreSQL, OpenAI GPT-5.1, AWS S3, Docker, Render
