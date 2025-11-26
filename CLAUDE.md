# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AretaCare is an AI-powered medical care advocate assistant that helps families understand complex medical information. It maintains **strict safety boundaries** - never diagnosing, recommending treatments, or predicting outcomes. The core function is to translate medical jargon, summarize clinical notes, and help families prepare questions for healthcare teams.

**Key Features:**
- JWT-based user authentication with secure password hashing
- Session-based conversation history tied to user accounts
- Professional UI with modern design and intuitive navigation
- Medical document upload with OCR support
- AI-powered medical information translation and summarization

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
- Four main tables: `users`, `sessions`, `documents`, `conversations`
- User table stores authentication credentials (bcrypt hashed passwords)
- Sessions tied to user accounts via foreign key
- Cascading deletes: deleting user removes all associated data
- Sessions expire after 60 minutes of inactivity

**Storage (AWS S3)**
- Medical documents uploaded to S3 with unique keys
- Text extraction happens on upload (PDF, images via OCR)
- Extracted text stored in database for quick access

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

### API Response Structure

Medical summaries follow a 4-part structure enforced by the OpenAI service:
1. Summary of Update (2-3 sentences)
2. Key Changes or Findings (bullet points)
3. Recommended Questions for the Care Team (3-5 questions)
4. Family Notes or Next Actions (brief guidance)

This structure is parsed from LLM responses in `_parse_medical_summary()`.

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
- `backend/app/core/config.py` - Pydantic settings, environment variables
- `backend/app/core/database.py` - SQLAlchemy session management
- `backend/app/core/auth.py` - **JWT & password hashing utilities** (bcrypt, jose)

### Models & Schemas

- `backend/app/models/user.py` - User model with authentication fields
- `backend/app/models/session.py` - Session model with user foreign key
- `backend/app/schemas/auth.py` - Auth request/response schemas (UserRegister, UserLogin, TokenResponse)

### Service Layer (Business Logic)

- `backend/app/services/openai_service.py` - **CRITICAL**: Contains safety prompt and all LLM interactions
- `backend/app/services/s3_service.py` - Document upload/download/delete to S3
- `backend/app/services/document_processor.py` - Text extraction (PDF, OCR for images)

### Frontend Entry Points

- `frontend/src/main.jsx` - React app entry point
- `frontend/src/App.jsx` - Router configuration, protected/public routes, layout
- `frontend/src/pages/Login.jsx` - Login page with form validation
- `frontend/src/pages/Register.jsx` - Registration page with password matching
- `frontend/src/components/Header.jsx` - Navigation with user avatar and auth UI
- `frontend/src/services/api.js` - Axios instance with auth token interceptor
- `frontend/src/hooks/useSession.js` - Session & auth state management (calls /auth/me)

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
- `OPENAI_API_KEY` - For GPT-4 interactions
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` - For document storage
- `DATABASE_URL` - Auto-configured in Docker Compose
- `SECRET_KEY` - For session security
- `CORS_ORIGINS` - Comma-separated allowed origins

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
2. Add route in `frontend/src/App.jsx`
3. Add navigation link in `frontend/src/components/Header.jsx`
4. Hot reload handles updates automatically

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
- Professional header with logo and user avatar (shows first initial)
- Color-coded feature cards (blue, green, purple, amber) with SVG icons
- Hover effects with smooth transitions
- Clear Session icon button (trash can) to delete conversation history
- Logout button to sign out

Sample medical text for testing (paste into Medical Summary):
```
Chief Complaint: Follow-up for hypertension
Vital Signs: BP 142/88 mmHg, HR 78 bpm
Assessment: Blood pressure elevated despite Lisinopril 10mg daily
Plan: Increase to 20mg daily, follow-up in 4 weeks
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

- `README.md` - Project overview and setup
- `QUICKSTART.md` - 5-minute local setup
- `docs/SETUP_GUIDE.md` - Detailed setup with AWS/OpenAI configuration
- `docs/API_USAGE.md` - API endpoint examples and reference
- `docs/SAFETY_GUIDELINES.md` - **Critical**: Safety requirements and boundaries
- `docs/AWS_IAM_POLICY.md` - AWS S3 IAM policy configuration
