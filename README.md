# AretaCare

**Calm | Clarity | Confidence**

A secure platform for patients and caregivers to organize information, understand complex concepts, and prepare for clearer conversations with care teams.

---

## The Problem

When someone you love is facing a health challenge, information comes at you from everywhere. Doctors explain things during rounds. Nurses relay instructions. Specialists share pieces of the puzzle. Reports arrive full of unfamiliar terms.

AretaCare was built from this experience—sitting beside a loved one, trying to keep track of everything while feeling overwhelmed.

---

## What It Does

### Core Experience

**Conversation** — Talk to AretaCare like you would a knowledgeable friend. Ask questions, share updates, upload documents, or record voice notes. It remembers your care situation and helps you make sense of complex medical information.

**Journal** — Every conversation automatically becomes a searchable timeline. Appointments, test results, care decisions, and milestones are captured and organized by date—no manual logging required. When you ask about past events, semantic search finds the most relevant entries from your full history.

**Daily Digest** — Each day, get a summary of what's happening: recent changes, upcoming reminders, and suggested questions for your care team. Fully editable if you want to add your own notes.

**Health Profile** — A living summary of everything AretaCare knows about your care situation: patient details, caregivers, providers, conditions, medications, allergies, and key events. You review and approve all changes before they're saved.

### Organization

**Multiple Sessions** — Managing care for different people, or want to keep situations separate? Create up to 5 sessions, each with its own conversations, documents, journal, and profile. When you have multiple sessions, each gets a distinct background color so you always know which one you're in.

**Session Sharing** — Invite up to 9 other people to collaborate on a session. Everyone sees the same information and can contribute to conversations. At login, a reminder popup alerts you when your current session has collaborators.

**Documents & Audio** — Upload PDFs, images, and text files (up to 30MB). Record audio directly in the app. Everything is automatically categorized and transcribed so you can find it later. Scanned PDFs are processed with OCR to extract text. Duplicate filenames are detected before upload with an option to proceed or cancel. Multi-part documents (e.g., a long report split across several PDFs) are automatically detected and cross-referenced in the journal.

### Tools (Free — No Account Required)

**Jargon Translator** — Paste confusing medical language and get clear explanations in plain terms, with citations to authoritative sources (Mayo Clinic, MedlinePlus, Cleveland Clinic, CDC).

**Conversation Coach** — Preparing for an appointment? Get help forming the right questions to ask your care team, with links to relevant medical resources. Sign in to use voice input and get personalized results from your journal.

### Security

**Multi-Factor Authentication** — Optional extra protection with passkeys, authenticator apps, or backup codes. Trusted devices skip MFA on recognized browsers.

**Controlled Access** — New signups require an invitation from an administrator, keeping the platform secure and manageable.

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

Open http://localhost:3001. The Jargon Translator and Conversation Coach are available without login. Create an account to access the full platform.

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
| iOS App | SwiftUI (iOS 17+), `@Observable @MainActor` ViewModels, XcodeGen, KeychainAccess, MarkdownUI, iPad-optimized layouts |
| Backend | FastAPI, SQLAlchemy, PostgreSQL + pgvector (28 tables) |
| AI | OpenAI GPT-5.2, GPT-4o-transcribe, text-embedding-3-small |
| Storage | AWS S3 |
| Deployment | Docker Compose, Render |

**Key Patterns:**
- 160K context window with prioritized loading (messages + tiered journal + semantic journal retrieval + health profile)
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
│   ├── models/       # SQLAlchemy models (28 tables)
│   ├── schemas/      # Pydantic schemas
│   └── services/     # Business logic
├── frontend/src/
│   ├── pages/        # React pages
│   ├── components/   # UI components
│   ├── contexts/     # State management
│   └── services/     # API client
├── ios/AretaCare/
│   ├── App/          # Entry point, content view
│   ├── Core/         # Auth, networking, models, constants
│   └── Features/     # SwiftUI views + ViewModels per feature
├── docs/             # Documentation
├── docker-compose.yml
└── render.yaml       # Production deployment
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | AWS, OpenAI, and iOS setup |
| [docs/API_USAGE.md](docs/API_USAGE.md) | API reference |
| [docs/SAFETY_GUIDELINES.md](docs/SAFETY_GUIDELINES.md) | AI safety requirements |
| [docs/AWS_IAM_POLICY.md](docs/AWS_IAM_POLICY.md) | S3 permissions |
| [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md) | Email configuration |
| [docs/FEEDBACK_SYSTEM.md](docs/FEEDBACK_SYSTEM.md) | Feedback form and hCaptcha |
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

*Built for patients and caregivers.*
