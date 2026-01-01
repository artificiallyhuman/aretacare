# AretaCare

**Care | Clarity | Confidence**

A secure platform for patients and caregivers to organize information, understand complex concepts, and prepare for clearer conversations with care teams.

---

## The Problem

When someone you love is facing a health challenge, information comes at you from everywhere. Doctors explain things during rounds. Nurses relay instructions. Specialists share pieces of the puzzle. Reports arrive full of unfamiliar terms.

AretaCare was built from this experience—sitting beside a loved one, trying to keep track of everything while feeling overwhelmed.

---

## What It Does

**Conversation** — Organize care information through chat. Type messages, record voice notes, share documents. AretaCare explains terminology and helps prepare for care team conversations. Edit messages, copy to clipboard as formatted text.

**Multi-Session Support** — Up to 5 personal sessions for different care situations. Each maintains separate conversations, documents, journal, and daily digests.

**Session Collaboration** — Share sessions with up to 10 people total. Manage collaborators, transfer ownership, handle pending invitations.

**Journal** — Automatic timeline from conversations. Updates, appointments, insights, milestones—all captured and categorized. Navigate by date, see future entries highlighted.

**Daily Digest** — Scannable summary of changes, reminders, and suggested questions. Editable and regenerated daily.

**Care Profile** — AI-powered long-term memory: patient info, caregivers, providers, conditions, medications (14 categories), allergies, events. Visual timeline, status badges, completeness tracking. You control all data through diff review.

**Documents & Audio** — AI-categorized uploads (12 categories each). PDFs, images, text files. Audio with live waveform, transcription, browser-friendly conversion.

**Specialized Tools** — Jargon Translator (explains terminology), Conversation Coach (prepares questions for care teams). Both support audio input.

**Security** — Optional MFA (passkeys, authenticator apps, backup codes), trusted devices, JWT authentication with refresh tokens, idle timeout, "logout everywhere" capability.

**Controlled Signups** — Waitlist mode (default) requires admin invitation. Administrators manage via console.

---

## Safety Boundaries

AretaCare is an organizational tool, not a clinician. It **never**:
- Diagnoses conditions or predicts outcomes
- Recommends or adjusts medications
- Disputes care team decisions
- Gives medical instructions

It always defers to healthcare professionals.

---

## Quick Start

### Prerequisites
- Docker Desktop
- OpenAI API key
- AWS S3 bucket

### Setup
```bash
git clone <repository-url>
cd aretacare
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
OPENAI_API_KEY=sk-your-key
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=your-bucket-region
S3_BUCKET_NAME=your-bucket
SECRET_KEY=generate-with-python-secrets
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=your-organization
FRONTEND_URL=http://localhost:3001
ADMIN_EMAILS=your-email@example.com
```

Generate secret: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### Run
```bash
docker compose up --build
```

Open http://localhost:3001, create account, verify email, log in.

### Stop
```bash
docker compose down      # Stop
docker compose down -v   # Stop and reset database
```

---

## Architecture

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, PostgreSQL |
| AI | OpenAI GPT-5.2, GPT-4o-transcribe |
| Storage | AWS S3 |
| Deployment | Docker Compose, Render |

**Key Patterns:**
- 150K context window with prioritized loading (messages + tiered journal + health profile)
- Cascade deletes (user/session deletion removes all data + S3 files)
- Auto-migrations on startup
- Centralized AI config in `backend/app/config/ai_config.py`

---

## Project Structure

```
aretacare/
├── backend/app/
│   ├── api/          # FastAPI routes
│   ├── config/       # AI configuration
│   ├── core/         # Auth, migrations, config
│   ├── models/       # SQLAlchemy models (23 tables)
│   ├── schemas/      # Pydantic schemas
│   └── services/     # Business logic
├── frontend/src/
│   ├── pages/        # React pages
│   ├── components/   # UI components
│   ├── contexts/     # State management
│   └── services/     # API client
├── docs/             # Documentation
├── docker-compose.yml
├── render.yaml       # Production deployment
└── CLAUDE.md         # Development guidance
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Development guidance |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | AWS and OpenAI setup |
| [docs/API_USAGE.md](docs/API_USAGE.md) | API reference |
| [docs/SAFETY_GUIDELINES.md](docs/SAFETY_GUIDELINES.md) | AI safety requirements |
| [docs/AWS_IAM_POLICY.md](docs/AWS_IAM_POLICY.md) | S3 permissions |
| [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md) | Email configuration |
| [docs/SECURITY_IMPLEMENTATION.md](docs/SECURITY_IMPLEMENTATION.md) | Security details |

---

## Deployment

Deploy to Render using `render.yaml`:

1. Push to GitHub
2. Connect in Render dashboard
3. Set environment variables: `OPENAI_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `ADMIN_EMAILS`
4. Deploy

Database migrations run automatically on startup.

---

## License

MIT with Commons Clause restrictions. See `LICENSE` and `COMMONS-CLAUSE.md`.

---

*Built for patients and caregivers who need more clarity and confidence.*
