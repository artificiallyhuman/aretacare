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

**Conversation** — Talk naturally about what's happening. Upload lab results, record voice notes, or type out questions. AretaCare helps translate medical jargon, organize information, and prepare you for conversations with the care team.

**Journal** — Your care journey automatically organized into a searchable timeline. Medical updates, symptoms, appointments, and questions—all captured and categorized so nothing falls through the cracks.

**Daily Plan** — AI-generated summaries of today's priorities, important reminders, and questions to ask at your next appointment. Editable and regenerated daily based on your situation.

**Documents & Recordings** — Upload PDFs and images of medical records. Record voice notes during appointments. Everything is automatically categorized, transcribed, and made searchable.

**Session Sharing** — Invite family members to collaborate on a session. Up to 5 people can share the same view, keeping everyone informed and aligned even when you're in different cities.

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
OPENAI_API_KEY=sk-your-key
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET_NAME=your-bucket
SECRET_KEY=generate-with-python-secrets
```

Generate a secret key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Run

```bash
docker compose up --build
```

Open http://localhost:3001 and create an account.

### Stop

```bash
docker compose down      # Stop services
docker compose down -v   # Stop and reset database
```

---

## Architecture

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, PostgreSQL |
| AI | OpenAI GPT-5.1 (Responses API) |
| Storage | AWS S3 |
| Deployment | Docker, Render |

All AI configuration (models, prompts, safety boundaries) is centralized in `backend/app/config/ai_config.py`.

---

## Project Structure

```
aretacare/
├── backend/
│   └── app/
│       ├── api/          # FastAPI routes
│       ├── config/       # AI prompts and safety rules
│       ├── models/       # SQLAlchemy models
│       ├── services/     # OpenAI, S3, document processing
│       └── main.py
├── frontend/
│   └── src/
│       ├── pages/        # React pages
│       ├── components/   # UI components
│       └── contexts/     # Session management
└── docs/                 # Setup guides and policies
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Development guidance for Claude Code |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Detailed AWS and OpenAI configuration |
| [docs/API_USAGE.md](docs/API_USAGE.md) | API endpoint reference |
| [docs/SAFETY_GUIDELINES.md](docs/SAFETY_GUIDELINES.md) | AI safety requirements |
| [docs/AWS_IAM_POLICY.md](docs/AWS_IAM_POLICY.md) | Required S3 permissions |
| [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md) | Password reset email configuration |

---

## Deployment

AretaCare deploys to Render using the included `render.yaml` blueprint:

1. Push to GitHub
2. Connect repository in Render dashboard
3. Add environment variables: `OPENAI_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
4. Deploy

---

## License

MIT

---

*Built with care for families navigating the healthcare system.*
