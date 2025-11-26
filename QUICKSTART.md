# AretaCare Quick Start Guide

Get AretaCare running locally in 5 minutes!

## Prerequisites

- Docker Desktop installed and running
- OpenAI API Key
- AWS S3 bucket (or use local storage for testing)

## Quick Setup

### 1. Configure Environment

```bash
# Backend environment
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add your keys:
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

### 2. Start the Application

```bash
docker-compose up --build
```

Wait for all services to start (about 2-3 minutes).

### 3. Access AretaCare

Open your browser:
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs

### 4. Test the Features

1. **Medical Summary**:
   - Click "Medical Summary" in the navigation
   - Paste sample medical text or upload a PDF
   - Click "Generate Summary"

2. **Jargon Translator**:
   - Click "Jargon Translator"
   - Enter a medical term (e.g., "hypertension")
   - Click "Translate"

3. **Conversation Coach**:
   - Click "Conversation Coach"
   - Describe an upcoming appointment
   - Get suggested questions

4. **Chat**:
   - Click "Chat"
   - Start a conversation about medical information

## Sample Medical Text for Testing

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

## Stopping the Application

```bash
docker-compose down
```

## Troubleshooting

### Services won't start
```bash
docker-compose down -v
docker system prune -a
docker-compose up --build
```

### Can't reach frontend
- Check if Docker containers are running: `docker-compose ps`
- Verify port 3000 is not in use: `lsof -i :3000`

### Backend errors
Check logs: `docker-compose logs backend`

### Database issues
Reset database: `docker-compose down -v && docker-compose up`

## Next Steps

- Read the full [Setup Guide](docs/SETUP_GUIDE.md)
- Review [API Usage](docs/API_USAGE.md)
- Understand [Safety Guidelines](docs/SAFETY_GUIDELINES.md)
- Check the [README](README.md) for deployment options

## Getting Help

1. Check logs: `docker-compose logs [service-name]`
2. Review documentation in `/docs`
3. Visit API docs: http://localhost:8000/docs
4. Contact the development team

## Production Deployment

For production deployment to Render:

1. Push code to GitHub
2. Connect to Render
3. Configure environment variables
4. Deploy with `render.yaml`

See [Setup Guide](docs/SETUP_GUIDE.md) for detailed instructions.
