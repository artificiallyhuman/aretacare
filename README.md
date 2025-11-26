# AretaCare - Your Family's AI Care Advocate

AretaCare is an AI-powered care advocate assistant that helps families navigate complex medical information with clarity, compassion, and confidence. It organizes medical updates, summarizes clinical notes, highlights key changes, and provides family-friendly questions to ask healthcare teams.

## Features

- **Medical Summary Generator**: Upload medical notes or paste text to get a clear, structured summary with key findings and recommended questions
- **Jargon Translator**: Translate complex medical terminology into simple, understandable language
- **Conversation Coach**: Prepare for healthcare appointments with suggested questions and conversation tips
- **Care Assistant Chat**: Have a conversation with AretaCare about medical information and care navigation

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

## Architecture

- **Backend**: FastAPI (Python)
- **Frontend**: React with Vite
- **Database**: PostgreSQL
- **Storage**: AWS S3
- **AI**: OpenAI GPT-4
- **Deployment**: Docker (local) / Render (production)

## Local Development Setup

### Prerequisites

- Docker and Docker Compose
- OpenAI API Key
- AWS Account with S3 bucket configured

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
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
   - `S3_BUCKET_NAME`: Your S3 bucket name
   - `SECRET_KEY`: Generate a secure random string

3. **Configure Frontend Environment**
   ```bash
   cp frontend/.env.example frontend/.env
   ```

4. **Start the Application**
   ```bash
   docker-compose up --build
   ```

   The application will be available at:
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

5. **Stop the Application**
   ```bash
   docker-compose down
   ```

## Deployment to Render

### Prerequisites

- Render account
- GitHub repository with your code
- OpenAI API Key
- AWS S3 bucket configured

### Deployment Steps

1. **Push your code to GitHub**

2. **Deploy using Blueprint**
   - Go to https://render.com
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will detect the `render.yaml` file and create:
     - `aretacare-db` - PostgreSQL database (basic plan)
     - `aretacare-backend` - FastAPI web service (starter plan)
     - `aretacare-frontend` - React static site

3. **Configure Environment Variables**

   In the Render dashboard for `aretacare-backend`, add these environment variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
   - `S3_BUCKET_NAME`: Your S3 bucket name

   The following are auto-configured:
   - `DATABASE_URL`: Auto-injected from `aretacare-db`
   - `SECRET_KEY`: Auto-generated
   - `CORS_ORIGINS`: Set to frontend URL

4. **Deploy**
   - Click "Apply" to deploy all services
   - Wait for all services to be live
   - Access your app at the frontend URL provided by Render

## API Documentation

Once the backend is running, visit:
- Local: http://localhost:8000/docs
- Production: https://your-backend-url.onrender.com/docs

## Project Structure

```
aretacare/
├── backend/
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── core/          # Core configuration
│   │   ├── models/        # Database models
│   │   ├── schemas/       # Pydantic schemas
│   │   └── services/      # Business logic services
│   ├── Dockerfile         # Local development
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── hooks/         # Custom React hooks
│   │   └── styles/        # CSS styles
│   ├── Dockerfile         # Local development
│   └── package.json
├── Dockerfile             # Production backend (Render)
├── docker-compose.yml     # Local development
└── render.yaml            # Render Blueprint config
```

## Privacy & Security

- Sessions are temporary and expire after 60 minutes of inactivity
- Medical documents are stored securely in AWS S3
- Conversation history is tied to sessions and can be cleared at any time
- No persistent user accounts or long-term data storage
- All data can be deleted by clearing the session

## Contributing

This is a private project. For questions or issues, contact the development team.

## License

Proprietary - All rights reserved

## Support

For support or questions about AretaCare:
1. Check the API documentation at `/docs`
2. Review this README
3. Contact the development team

## Acknowledgments

Built with:
- FastAPI
- React
- PostgreSQL
- OpenAI GPT-4
- AWS S3
- Docker
- Render
