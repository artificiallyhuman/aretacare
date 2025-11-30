# AretaCare Setup Guide

This guide will walk you through setting up AretaCare for local development and production deployment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [AWS S3 Configuration](#aws-s3-configuration)
4. [OpenAI API Setup](#openai-api-setup)
5. [Running the Application](#running-the-application)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Docker Desktop** (v20.10 or higher)
  - Download: https://www.docker.com/products/docker-desktop
- **Git**
  - Download: https://git-scm.com/downloads

### Required Accounts

- **OpenAI Account** with API access
  - Sign up: https://platform.openai.com/
- **AWS Account** for S3 storage
  - Sign up: https://aws.amazon.com/
- **Render Account** (for production deployment)
  - Sign up: https://render.com/

## Local Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd aretacare
```

### 2. Backend Configuration

Create the backend environment file:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Database Configuration
DATABASE_URL=postgresql://aretacare:password@db:5432/aretacare
POSTGRES_USER=aretacare
POSTGRES_PASSWORD=password
POSTGRES_DB=aretacare

# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-openai-api-key-here

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key-here
AWS_SECRET_ACCESS_KEY=your-aws-secret-key-here
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-s3-bucket-name-here

# Application Configuration
SECRET_KEY=your-secret-key-here-use-long-random-string
DEBUG=True
CORS_ORIGINS=http://localhost:3000

# Admin Configuration
ADMIN_EMAILS=your-email@example.com
AUDIT_LOG_RETENTION_DAYS=90

# S3 Key Prefix (optional, for shared buckets between environments)
S3_KEY_PREFIX=dev/
```

**Generate a Secret Key:**

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Frontend Configuration

Create the frontend environment file:

```bash
cp frontend/.env.example frontend/.env
```

The default configuration should work for local development:

```env
VITE_API_URL=http://localhost:8000/api
```

## AWS S3 Configuration

### 1. Create an S3 Bucket

1. Log in to AWS Console: https://console.aws.amazon.com/s3/
2. Click "Create bucket"
3. Enter a unique bucket name (e.g., `aretacare-documents-prod`)
4. Choose your preferred region
5. **Block all public access** (keep this enabled for security)
6. Click "Create bucket"

### 2. Configure CORS

1. Open your bucket
2. Go to "Permissions" tab
3. Scroll to "Cross-origin resource sharing (CORS)"
4. Add this configuration:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
        "ExposeHeaders": []
    }
]
```

### 3. Create IAM User

1. Go to IAM Console: https://console.aws.amazon.com/iam/
2. Click "Users" → "Add users"
3. Enter username: `aretacare-app`
4. Select "Access key - Programmatic access"
5. Click "Next: Permissions"
6. Click "Attach policies directly"
7. Search and select: `AmazonS3FullAccess`
8. Click "Next" through to "Create user"
9. **Save the Access Key ID and Secret Access Key** (you won't see them again!)

## OpenAI API Setup

### 1. Get API Key

1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to "API Keys" in the dashboard
4. Click "Create new secret key"
5. Copy the key immediately (you won't see it again!)
6. Add credits to your account (Settings → Billing)

### 2. Set Usage Limits (Recommended)

1. Go to "Usage limits" in your OpenAI dashboard
2. Set a monthly budget limit (e.g., $20)
3. Enable email notifications

## Running the Application

### 1. Start with Docker Compose

```bash
docker-compose up --build
```

This will:
- Build and start the PostgreSQL database
- Build and start the backend API
- Build and start the frontend

### 2. Verify Services

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### 3. Stop the Application

```bash
docker-compose down
```

To also remove volumes (database data):

```bash
docker-compose down -v
```

## Production Deployment

### Option 1: Deploy to Render (Recommended)

#### 1. Prepare Your Repository

Ensure your code is in a GitHub repository.

#### 2. Create Render Account

Sign up at https://render.com/

#### 3. Deploy via Blueprint

1. Click "New" → "Blueprint"
2. Connect your GitHub repository
3. Render will detect `render.yaml`
4. Click "Apply"

#### 4. Configure Environment Variables

In the Render dashboard, set these environment variables for the backend service:

- `OPENAI_API_KEY`: Your OpenAI API key
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `S3_BUCKET_NAME`: Your S3 bucket name
- `ADMIN_EMAILS`: Comma-separated admin email addresses
- `S3_KEY_PREFIX`: Environment prefix (e.g., `prod/`) if sharing bucket with dev

#### 5. Update S3 CORS

Add your Render frontend URL to S3 CORS configuration:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": [
            "http://localhost:3000",
            "https://your-app.onrender.com"
        ],
        "ExposeHeaders": []
    }
]
```

### Option 2: Deploy to Your Own Server

#### 1. Server Requirements

- Ubuntu 20.04+ or similar Linux distribution
- Docker and Docker Compose installed
- Domain name pointed to your server
- SSL certificate (Let's Encrypt recommended)

#### 2. Clone and Configure

```bash
git clone <repository-url>
cd aretacare
cp backend/.env.example backend/.env
# Edit backend/.env with production values
```

#### 3. Update Docker Compose for Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  backend:
    build: ./backend
    env_file: ./backend/.env
    depends_on:
      - db
    restart: always

  frontend:
    build: ./frontend
    environment:
      - VITE_API_URL=https://api.yourdomain.com
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    depends_on:
      - backend
      - frontend
    restart: always

volumes:
  postgres_data:
```

## Troubleshooting

### Common Issues

#### 1. Docker Build Fails

**Problem**: `ERROR: failed to solve: process "/bin/sh -c pip install..."`

**Solution**: Clear Docker cache and rebuild:
```bash
docker-compose down
docker system prune -a
docker-compose up --build
```

#### 2. Database Connection Error

**Problem**: `could not connect to server: Connection refused`

**Solution**: Ensure database is healthy:
```bash
docker-compose logs db
docker-compose restart db
```

#### 3. S3 Upload Fails

**Problem**: `Access Denied` when uploading documents

**Solution**:
- Verify AWS credentials are correct
- Check IAM user has S3 permissions
- Verify bucket name is correct

#### 4. OpenAI API Errors

**Problem**: `Insufficient quota` or `API key invalid`

**Solution**:
- Verify API key is correct
- Check billing in OpenAI dashboard
- Add credits to your account

#### 5. Frontend Can't Reach Backend

**Problem**: `Network Error` in frontend

**Solution**:
- Check `VITE_API_URL` in frontend/.env
- Verify CORS settings in backend
- Check backend is running: http://localhost:8000/health

### Logs

View logs for specific services:

```bash
# All services
docker-compose logs

# Backend only
docker-compose logs backend

# Frontend only
docker-compose logs frontend

# Database only
docker-compose logs db

# Follow logs in real-time
docker-compose logs -f backend
```

### Reset Everything

If you need to start fresh:

```bash
# Stop all containers
docker-compose down -v

# Remove all images
docker system prune -a

# Rebuild from scratch
docker-compose up --build
```

## Getting Help

If you encounter issues:

1. Check the logs using commands above
2. Review this guide and the main README
3. Check API documentation at http://localhost:8000/docs
4. Contact the development team

## Next Steps

After successful setup:

1. Register a new user account
2. Test the conversation interface
3. Upload a sample medical document
4. Try the jargon translator
5. Test the conversation coach
6. Generate a daily plan
7. Create journal entries
8. Monitor logs for any errors
9. Set up monitoring for production
