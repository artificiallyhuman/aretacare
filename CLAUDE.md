# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AretaCare is an AI-powered medical care advocate assistant that helps families understand complex medical information. It maintains **strict safety boundaries** - never diagnosing, recommending treatments, or predicting outcomes. The core function is to translate medical jargon, summarize clinical notes, and help families prepare questions for healthcare teams.

**Key Features:**
- **Conversation-first interface** with AI care advocate as the primary interaction model
- **Enhanced markdown rendering** with custom ReactMarkdown components, color-aware styling, and clean typography
- **AI Journal Synthesis** that automatically extracts and organizes medical updates from conversations
- **GPT-5.1 native file support** for PDFs and images via Responses API
- **Audio recording** with separate start/stop buttons, visual feedback, and real-time transcription
- JWT-based user authentication with secure password hashing
- Session-based conversation history tied to user accounts
- Collapsible journal panel (hidden by default) with organized entries by date
- **About page** with comprehensive feature descriptions organized as intro sentences + bullet points
- Professional UI with modern design and smart UI behaviors (click-away dropdowns, smart scrolling, mobile modals)
- Mobile-responsive design with hamburger menu navigation (About after Tools) and full-screen journal modal
- Medical document upload with OCR support, S3 storage, and automatic cleanup on session clear
- Image previews in Documents page with thumbnail grid
- Specialized tools: Jargon Translator (with voice input), Conversation Coach (with voice recording), Documents Manager

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
- Five main tables: `users`, `sessions`, `documents`, `conversations`, `journal_entries`
- User table stores authentication credentials (bcrypt hashed passwords)
- Sessions tied to user accounts via foreign key
- Journal entries with AI-generated content, metadata, and entry types
- Conversations include rich media support (message_type, document_id, media_url fields)
- Cascading deletes: deleting user removes all associated data
- Sessions expire after 60 minutes of inactivity
- Database can be reset with `RESET_DB=true` environment variable (development/production)

**Storage (AWS S3)**
- Medical documents uploaded to S3 with unique keys
- Text extraction happens on upload (PDF, images via OCR)
- Extracted text stored in database for quick access
- Presigned URLs generated for secure document access (24-hour expiration)
- Native GPT-5.1 file support via presigned URLs passed to OpenAI API

### Critical Safety Architecture

The **OpenAI system prompt** in `backend/app/services/openai_service.py` enforces all safety boundaries:

```python
SYSTEM_PROMPT = """You are AretaCare...
STRICT SAFETY BOUNDARIES - YOU MUST NEVER:
- Diagnose any medical condition
- Recommend or adjust medications
- Predict medical outcomes
- Dispute clinician decisions
- Give medical instructions
"""
```

**This prompt is the enforcement mechanism for all safety requirements.** Any changes to AI behavior must update this prompt while maintaining safety boundaries.

### Application Architecture

**Conversation-First Design**
- Primary interface is a conversational chat with AI care advocate
- Enhanced markdown rendering with custom ReactMarkdown components for clean, readable formatting
- Color-aware styling: prose-invert for user messages, prose-gray for AI messages
- Journal panel hidden by default; opens as sidebar on desktop (md+) or full-screen modal on mobile
- Welcome page with "How to Get Started" instructions directing users to message box
- Messages can include text, uploaded documents (PDFs), images, and voice recordings
- Separate audio recording buttons: start (microphone icon) and stop (red button with "Stop Recording" text)
- Smart scrolling: auto-scroll only when user is near bottom, manual scroll button otherwise
- Compact message spacing (space-y-2) for better conversation flow
- Conversation history persists across sessions

**AI Journal Synthesis**
- `JournalService` analyzes user messages and AI responses for medical significance
- Uses `assess_and_synthesize()` to determine if conversation warrants journal entries
- Automatically creates structured entries with:
  - Title (brief summary)
  - Content (detailed information)
  - Entry type (appointment, symptom, medication, test_result, milestone, note)
  - Date and confidence score
- Marks conversation messages as `synthesized_to_journal=True` when processed
- Users can manually add, edit, or delete journal entries

**GPT-5.1 Native File Support**
- Uses OpenAI Responses API (`openai.beta.responses.create()`)
- Documents and images passed via presigned S3 URLs
- `document_url` and `document_type` parameters in `chat_with_journal()` method
- Supports PDFs, images (PNG, JPG), and text files
- OCR text extraction stored as fallback for compatibility

**Smart UI Behavior**
- Click-away dropdown menus (tools menu closes when clicking outside)
- Smart scrolling: auto-scroll only when near bottom and messages exist
- Scroll-to-bottom button appears when user scrolls up in conversation
- Responsive design with mobile hamburger menu (lg breakpoint)
- Mobile journal as full-screen modal with backdrop overlay (md breakpoint)
- Image thumbnails in Documents page with 192px height preview cards
- S3 file cleanup on session deletion prevents orphaned files in storage
- Compact message spacing (space-y-2) for better conversation flow

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
- `backend/app/api/auth.py` - **Authentication endpoints** (register, login, /me)
- `backend/app/api/sessions.py` - Session management with S3 cleanup on delete
- `backend/app/api/documents.py` - Document upload/management with presigned URLs
- `backend/app/api/conversation.py` - Conversation endpoints with rich media support
- `backend/app/api/journal.py` - Journal CRUD operations
- `backend/app/api/tools.py` - Standalone tools (Jargon Translator, Conversation Coach)
- `backend/app/core/config.py` - Pydantic settings, environment variables
- `backend/app/core/database.py` - SQLAlchemy session management
- `backend/app/core/auth.py` - **JWT & password hashing utilities** (bcrypt, jose)

### Models & Schemas

- `backend/app/models/user.py` - User model with authentication fields
- `backend/app/models/session.py` - Session model with user foreign key
- `backend/app/models/journal.py` - Journal entries with AI-generated content
- `backend/app/models/conversation.py` - Conversation messages with rich media support
- `backend/app/schemas/auth.py` - Auth request/response schemas (UserRegister, UserLogin, TokenResponse)
- `backend/app/schemas/journal.py` - Journal entry schemas with synthesis metadata
- `backend/app/schemas/conversation.py` - Message schemas with document/image support

### Service Layer (Business Logic)

- `backend/app/services/openai_service.py` - **CRITICAL**: Contains safety prompt, GPT-5.1 integration, all LLM interactions
- `backend/app/services/journal_service.py` - **Journal synthesis logic**: Analyzes conversations, creates journal entries
- `backend/app/services/s3_service.py` - Document upload/download/delete to S3, presigned URL generation
- `backend/app/services/document_processor.py` - Text extraction (PDF, OCR for images)

### Frontend Entry Points

- `frontend/src/main.jsx` - React app entry point
- `frontend/src/App.jsx` - Router configuration, protected/public routes, layout with responsive footer
- `frontend/src/pages/Login.jsx` - Login page with professional styling, mobile-responsive
- `frontend/src/pages/Register.jsx` - Registration page with professional styling, mobile-responsive
- `frontend/src/pages/Conversation.jsx` - **Main conversation interface** with chat + journal panel, smart scrolling, welcome page with "How to Get Started"
- `frontend/src/pages/About.jsx` - **About page** with comprehensive feature descriptions organized as intro sentences + bullet points (Conversation, Journal, Tools, Privacy)
- `frontend/src/pages/tools/` - Standalone tools (JargonTranslator with voice input, ConversationCoach with voice recording, Documents with image previews)
- `frontend/src/components/Header.jsx` - **Mobile-responsive navigation** with hamburger menu (lg breakpoint), tools dropdown with click-away behavior, About link after Tools
- `frontend/src/components/Disclaimer.jsx` - Responsive safety disclaimer component
- `frontend/src/components/Journal/JournalPanel.jsx` - Collapsible journal sidebar with entries by date
- `frontend/src/components/MessageBubble.jsx` - Chat message display with custom ReactMarkdown components and color-aware styling
- `frontend/src/components/MessageInput.jsx` - Chat input with file upload (documents/images) and separate start/stop audio recording buttons
- `frontend/src/services/api.js` - Axios instance with auth token interceptor, conversation/journal/tools APIs
- `frontend/src/hooks/useSession.js` - Session & auth state management (calls /auth/me)
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
- `RESET_DB` - Optional: Set to "true" to drop and recreate database on startup (development/production)

Frontend optional (`frontend/.env`):
- `VITE_API_URL` - Override API URL (defaults to `/api`)

### Package Version Constraints

Critical version pins in `backend/requirements.txt`:
- `httpx<0.28.0` - Version 0.28+ breaks OpenAI client
- `openai>=1.56.0` - Earlier versions have httpx incompatibility
- `pytesseract==0.3.10` - Python wrapper for tesseract-ocr (OCR capability)
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

### Modifying OpenAI Behavior

1. Edit `SYSTEM_PROMPT` in `backend/app/services/openai_service.py`
2. **Maintain all safety boundaries** - never diagnose, recommend treatments, etc.
3. Test thoroughly with medical text samples

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
2. Database auto-creates tables on startup (no migrations currently)
3. To reset schema: `docker compose down -v && docker compose up -d`

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
- **Conversation-first interface**: Main page is chat with AI care advocate
- **Enhanced markdown rendering**: Custom ReactMarkdown components with color-aware styling (prose-invert for user, prose-gray for AI)
- **Welcome page**: Clear onboarding with "How to Get Started" instructions and example topics directing to message box
- **About page**: Comprehensive feature descriptions organized with intro sentences + color-coded bullet points (blue: Conversation, green: Journal, purple: Tools, gray: Privacy)
- **Collapsible journal panel**: Hidden by default, sidebar on desktop, full-screen modal on mobile
- **Smart scrolling**: Auto-scroll when near bottom (only with messages), manual scroll-to-bottom button when scrolled up
- **Audio recording**: Separate start (microphone icon) and stop (red "Stop Recording" button) with visual feedback and transcription status
- **Click-away dropdowns**: Tools menu closes when clicking outside
- **Mobile-responsive navigation**: Hamburger menu on mobile (<1024px), full nav on desktop, About link positioned after Tools
- Professional header with AretaCare branding, user avatar (shows first initial), and tools dropdown
- File upload support: Upload PDFs, images (PNG, JPG), or text files in conversation
- Voice input support: Jargon Translator and Conversation Coach both have audio recording capabilities
- Compact message spacing for better conversation flow
- Responsive design with Tailwind CSS breakpoints (sm, md, lg)
- Professional login/register pages with consistent styling
- Clear Session icon button (trash can) to delete conversation history and S3 files - **permanent deletion warning emphasized**
- Logout button to sign out
- Documents manager with image previews (thumbnails) and full-size preview modal

**Testing the Application:**

1. **Welcome page**: See "How to Get Started" with instructions and example topics
2. **Start conversation**: Type in message box or click microphone to record voice, send first message
3. **Audio recording**: Click microphone, speak, click red "Stop Recording" button when finished
4. **Upload a document**: Click attach button, select PDF or image
5. **View About page**: Navigate to About (after Tools in menu) to see comprehensive feature descriptions with organized bullet points
6. **Journal synthesis**: Ask medical questions, click "Show Journal" to view auto-generated entries
7. **Tools section**: Access Jargon Translator (with voice input), Conversation Coach (with voice recording), Documents (with image previews)
8. **Clear session**: Click trash icon - see permanent deletion warning, confirm to delete all data (includes S3 files)

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

**Read `docs/SAFETY_GUIDELINES.md` before modifying any LLM-related code.**

The application's core value proposition is maintaining safety boundaries. Any code changes that:
- Modify `openai_service.py`
- Add new LLM features
- Change how medical information is presented

Must be reviewed against the safety guidelines to ensure:
- No diagnosis or treatment recommendations
- No outcome predictions
- Deference to medical professionals
- Calm, professional tone maintained

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
