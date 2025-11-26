# AretaCare - Your Family's AI Care Advocate

AretaCare is an AI-powered care advocate assistant that helps families navigate complex medical information with clarity, compassion, and confidence. It organizes medical updates, summarizes clinical notes, highlights key changes, and provides family-friendly questions to ask healthcare teams.

## Features

- **User Authentication**: Secure registration and login with JWT-based authentication
- **Medical Summary Generator**: Upload medical notes or paste text to get a clear, structured summary with key findings and recommended questions
- **Jargon Translator**: Translate complex medical terminology into simple, understandable language
- **Conversation Coach**: Prepare for healthcare appointments with suggested questions and conversation tips
- **Care Assistant Chat**: Have a conversation with AretaCare about medical information and care navigation
- **Session Management**: Temporary sessions tied to user accounts with conversation history
- **Professional UI**: Clean, modern interface with intuitive navigation and professional design
- **Mobile Responsive**: Fully optimized for mobile devices with hamburger menu navigation and touch-friendly interface
- **Accessibility**: Professional design system with consistent spacing, typography, and visual hierarchy

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

   **Important**: Your AWS IAM user must have the correct S3 permissions. See `docs/AWS_IAM_POLICY.md` for the required IAM policy configuration. The IAM user needs these permissions on your S3 bucket:
   - `s3:PutObject` - Upload documents
   - `s3:GetObject` - Download documents
   - `s3:DeleteObject` - Delete documents
   - `s3:PutObjectAcl` - Set object permissions

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

   **Important**: Ensure your AWS IAM user has the correct S3 permissions. See `docs/AWS_IAM_POLICY.md` for the required policy. Without proper permissions, document uploads will fail with AccessDenied errors.

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
│   │   ├── api/
│   │   │   ├── auth.py         # Authentication endpoints (register, login, /me)
│   │   │   ├── sessions.py     # Session management
│   │   │   ├── documents.py    # Document upload/management
│   │   │   └── medical.py      # Medical AI features
│   │   ├── core/
│   │   │   ├── auth.py         # JWT & password hashing utilities
│   │   │   ├── config.py       # Environment configuration
│   │   │   └── database.py     # Database connection
│   │   ├── models/
│   │   │   ├── user.py         # User model with authentication
│   │   │   ├── session.py      # Session model
│   │   │   ├── document.py     # Document model
│   │   │   └── conversation.py # Conversation history
│   │   ├── schemas/
│   │   │   ├── auth.py         # Auth request/response schemas
│   │   │   └── ...             # Other schemas
│   │   └── services/
│   │       ├── openai_service.py    # GPT-4 integration (CRITICAL)
│   │       ├── s3_service.py        # AWS S3 operations
│   │       └── document_processor.py # PDF/OCR processing
│   ├── Dockerfile         # Local development
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx      # Responsive navigation with mobile hamburger menu
│   │   │   └── Disclaimer.jsx  # Safety disclaimer component
│   │   ├── pages/
│   │   │   ├── Login.jsx       # Login page with professional styling
│   │   │   ├── Register.jsx    # Registration page
│   │   │   ├── Home.jsx        # Dashboard with feature cards
│   │   │   ├── MedicalSummary.jsx    # Medical summary generator
│   │   │   ├── JargonTranslator.jsx  # Medical jargon translator
│   │   │   ├── ConversationCoach.jsx # Conversation preparation coach
│   │   │   └── Chat.jsx              # AI care assistant chat
│   │   ├── services/
│   │   │   └── api.js          # Axios instance with auth token interceptors
│   │   ├── hooks/
│   │   │   └── useSession.js   # Session & auth state management
│   │   └── styles/
│   │       └── index.css       # Tailwind CSS with custom components
│   ├── Dockerfile         # Local development
│   └── package.json
├── Dockerfile             # Production backend (Render)
├── docker-compose.yml     # Local development
└── render.yaml            # Render Blueprint config
```

## Privacy & Security

- **User Authentication**: Secure JWT-based authentication with bcrypt password hashing
- **Password Security**: 72-character maximum (bcrypt limit), minimum 8 characters required
- **Session Management**: Sessions tied to user accounts, expire after 60 minutes of inactivity
- **Medical Documents**: Stored securely in AWS S3 with encrypted transmission
- **Conversation History**: Tied to user sessions and can be cleared at any time
- **Data Control**: Users can clear their session data at any time via the "Clear Session" button
- **Active Sessions**: 7-day JWT token expiration with automatic renewal

## Contributing

This is a private project. For questions or issues, contact the development team.

## License

Proprietary - All rights reserved

## Support

For support or questions about AretaCare:
1. Check the API documentation at `/docs`
2. Review this README
3. Contact the development team

## First-Time Setup

When you first access the application:

1. **Register an Account**
   - Navigate to the registration page
   - Provide your name, email, and password (8-72 characters)
   - Upon successful registration, you'll be automatically logged in

2. **Login**
   - Use your email and password to access your account
   - JWT tokens are valid for 7 days

3. **Start Using Features**
   - Access all features from the navigation menu
   - Your session and conversation history are saved to your account
   - Use "Clear Session" to delete your current session data

## Acknowledgments

Built with:
- **Backend**: FastAPI, Python 3.11, SQLAlchemy
- **Frontend**: React, Vite, TailwindCSS
- **Database**: PostgreSQL
- **Authentication**: JWT (python-jose), bcrypt (passlib)
- **AI**: OpenAI GPT-4
- **Storage**: AWS S3
- **Infrastructure**: Docker, Render
- **OCR**: Tesseract (pytesseract)
- **PDF Processing**: PyPDF2
