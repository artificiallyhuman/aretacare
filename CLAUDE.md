# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AretaCare is an AI-powered medical care advocate assistant that helps families understand complex medical information. It maintains **strict safety boundaries** - never diagnosing, recommending treatments, or predicting outcomes. The core function is to translate medical jargon, summarize clinical notes, and help families prepare questions for healthcare teams.

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

**Frontend (React + Vite)**
- Lives in `frontend/src/`
- Uses **relative API URLs** (`/api`) to leverage Vite's proxy in Docker
- Session management via `useSession` hook stores session ID in localStorage
- No user authentication - privacy via temporary sessions

**Database (PostgreSQL)**
- Three main tables: `sessions`, `documents`, `conversations`
- Cascading deletes: deleting session removes all associated data
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

### Session-Based Privacy

- No persistent user accounts
- Session ID created on first visit, stored in browser localStorage
- All data (documents, conversations) tied to session ID
- Clearing session deletes all associated data from both database and S3
- Sessions auto-expire via `SESSION_TIMEOUT_MINUTES` (default: 60)

## Key Files and Their Roles

### Backend Entry Points

- `backend/app/main.py` - FastAPI application, CORS config, route mounting
- `backend/app/api/__init__.py` - Combines all API routers
- `backend/app/core/config.py` - Pydantic settings, environment variables
- `backend/app/core/database.py` - SQLAlchemy session management

### Service Layer (Business Logic)

- `backend/app/services/openai_service.py` - **CRITICAL**: Contains safety prompt and all LLM interactions
- `backend/app/services/s3_service.py` - Document upload/download/delete to S3
- `backend/app/services/document_processor.py` - Text extraction (PDF, OCR for images)

### Frontend Entry Points

- `frontend/src/main.jsx` - React app entry point
- `frontend/src/App.jsx` - Router configuration, main layout
- `frontend/src/services/api.js` - Axios instance, all API functions
- `frontend/src/hooks/useSession.js` - Session creation and management

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

## Common Development Scenarios

### Adding a New API Endpoint

1. Add route to appropriate file in `backend/app/api/`
2. Create schema in `backend/app/schemas/` if needed
3. Restart backend: `docker compose restart backend`

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

Deployment via `render.yaml` blueprint to Render.com:
- Creates 3 services: PostgreSQL database, FastAPI backend, React frontend (static)
- Environment variables must be set in Render dashboard
- Frontend built as static site, served from `frontend/dist`
- Database URL auto-injected into backend

## Documentation

- `README.md` - Project overview and setup
- `QUICKSTART.md` - 5-minute local setup
- `docs/SETUP_GUIDE.md` - Detailed setup with AWS/OpenAI configuration
- `docs/API_USAGE.md` - API endpoint examples and reference
- `docs/SAFETY_GUIDELINES.md` - **Critical**: Safety requirements and boundaries
- `docs/AWS_IAM_POLICY.md` - AWS S3 IAM policy configuration
