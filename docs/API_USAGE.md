# AretaCare API Usage Guide

This guide provides examples of how to use the AretaCare API.

## Base URL

- Local: `http://localhost:8000/api`
- Production: `https://your-backend.onrender.com/api`

## API Documentation

Interactive API documentation is available at:
- `/docs` - Swagger UI
- `/redoc` - ReDoc UI

## Authentication

AretaCare uses JWT-based authentication. Most endpoints require an authentication token in the Authorization header.

### Authentication Endpoints

#### Register New User

```bash
POST /api/auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Login

```bash
POST /api/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Get Current User

```bash
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### Using Authentication Token

Include the JWT token in the Authorization header for all authenticated requests:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:8000/api/sessions/
```

## API Endpoints

### Sessions

#### Create a New Session

```bash
POST /api/sessions/
```

**Response:**
```json
{
  "id": "uuid-string",
  "created_at": "2025-01-15T10:00:00Z",
  "last_activity": "2025-01-15T10:00:00Z",
  "is_active": true
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/sessions/
```

#### Get Session Details

```bash
GET /api/sessions/{session_id}
```

**Example:**
```bash
curl http://localhost:8000/api/sessions/{session_id}
```

#### Delete Session

```bash
DELETE /api/sessions/{session_id}
Authorization: Bearer <token>
```

**Important:** Only the session owner can delete a session. This endpoint performs a complete cleanup of all session data:
- **PostgreSQL**: Deletes all conversations, journal entries, documents metadata, audio recordings metadata, and daily plans
- **AWS S3**: Deletes all document files, PDF thumbnails, and audio recording files
- **User Account**: Preserved (user can login and start a new session)

**Response:**
```json
{
  "message": "Session deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/sessions/{session_id} \
  -H "Authorization: Bearer <token>"
```

#### Check User for Sharing

```bash
POST /api/sessions/{session_id}/check-user
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "collaborator@example.com"
}
```

**Response (User Found):**
```json
{
  "exists": true,
  "user_id": "uuid-string",
  "name": "Jane Doe",
  "message": null
}
```

**Response (User Not Found or Cannot Be Added):**
```json
{
  "exists": false,
  "message": "No AretaCare account found with this email address."
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/check-user \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "collaborator@example.com"}'
```

#### Share Session

```bash
POST /api/sessions/{session_id}/share
Authorization: Bearer <token>
Content-Type: application/json
```

**Note:** Only the session owner can share. Maximum 10 people per session (1 owner + 9 collaborators).

**Request Body:**
```json
{
  "email": "collaborator@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session shared with Jane Doe",
  "collaborator": {
    "user_id": "uuid-string",
    "email": "collaborator@example.com",
    "name": "Jane Doe",
    "added_at": "2025-01-15T10:00:00Z"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/share \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "collaborator@example.com"}'
```

#### Revoke Collaborator Access

```bash
DELETE /api/sessions/{session_id}/collaborators/{user_id}
Authorization: Bearer <token>
```

**Note:** Only the session owner can revoke access.

**Response:**
```json
{
  "message": "Access revoked successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/sessions/{session_id}/collaborators/{user_id} \
  -H "Authorization: Bearer <token>"
```

#### Leave Shared Session

```bash
POST /api/sessions/{session_id}/leave
Authorization: Bearer <token>
```

**Note:** Only collaborators can leave. Session owners must delete the session instead.

**Response:**
```json
{
  "message": "Left session successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/leave \
  -H "Authorization: Bearer <token>"
```

#### Send Invitation (for non-users)

```bash
POST /api/sessions/{session_id}/invite
Authorization: Bearer <token>
Content-Type: application/json
```

**Note:** Send email invitation to someone who doesn't have an AretaCare account. Only the session owner can send invitations.

**Request Body:**
```json
{
  "email": "newuser@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invitation sent to newuser@example.com"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/invite \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "newuser@example.com"}'
```

#### Get Pending Invitations

```bash
GET /api/sessions/{session_id}/invitations
Authorization: Bearer <token>
```

**Note:** Only the session owner can view pending invitations.

**Response:**
```json
[
  {
    "id": "uuid-string",
    "email": "newuser@example.com",
    "invited_by_name": "John Doe",
    "created_at": "2025-01-15T10:00:00Z",
    "days_remaining": 25
  }
]
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/sessions/{session_id}/invitations
```

#### Cancel Invitation

```bash
DELETE /api/sessions/{session_id}/invitations/{invitation_id}
Authorization: Bearer <token>
```

**Note:** Only the session owner can cancel invitations.

**Response:**
```json
{
  "message": "Invitation cancelled successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/sessions/{session_id}/invitations/{invitation_id} \
  -H "Authorization: Bearer <token>"
```

#### Transfer Session Ownership

```bash
POST /api/sessions/{session_id}/transfer
Authorization: Bearer <token>
Content-Type: application/json
```

**Note:** Only the session owner can transfer ownership. Target user must:
- Be an existing collaborator on the session
- Own fewer than 3 sessions (users can own max 3 sessions)

**Request Body:**
```json
{
  "user_id": "uuid-of-new-owner"
}
```

**Response:**
```json
{
  "message": "Ownership transferred to Jane Doe"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/transfer \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "uuid-of-collaborator"}'
```

### Documents

#### Upload Document

```bash
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (file): The document to upload
- `session_id` (string, optional): Session ID to associate with
- `skip_journal_synthesis` (boolean, optional): Skip automatic journal entry creation (default: false)
- `user_date` (string, optional): User's local date in YYYY-MM-DD format for timezone-accurate journal entries (recommended)

**Supported File Types:**
- PDF (`application/pdf`)
- Images: JPEG, PNG (`image/jpeg`, `image/png`)
- Text files (`text/plain`)

**File Size Limit:** 20MB

**Processing:**
- PDFs: Text extraction + thumbnail generation (first page at 150 DPI, max width 300px)
- Images: OCR text extraction
- All files: Text content stored in database
- AI categorization into 12 categories (Lab Results, Imaging, Medications, etc.)
- AI-generated description (user-editable)
- **Journal synthesis**: Automatically creates journal entry if content is medically relevant

**Response:**
```json
{
  "id": 1,
  "filename": "medical_report.pdf",
  "content_type": "application/pdf",
  "uploaded_at": "2025-01-15T10:00:00Z",
  "extracted_text": "Extracted text content...",
  "thumbnail_s3_key": "thumbnails/uuid.png",
  "category": "LAB_RESULTS",
  "ai_description": "Blood work results showing cholesterol levels"
}
```

**Example:**
```bash
# Basic upload
curl -X POST http://localhost:8000/api/documents/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@medical_report.pdf" \
  -F "session_id=your-session-id"

# Upload with timezone-aware journal entry
curl -X POST "http://localhost:8000/api/documents/upload?session_id=your-session-id&user_date=2025-01-16" \
  -H "Authorization: Bearer <token>" \
  -F "file=@medical_report.pdf"
```

#### Get Session Documents

```bash
GET /api/documents/session/{session_id}
```

**Example:**
```bash
curl http://localhost:8000/api/documents/session/{session_id}
```

#### Get Document Thumbnail URL

```bash
GET /api/documents/{document_id}/thumbnail-url
Authorization: Bearer <token>
```

**Note:** Only available for PDF documents. Returns a presigned S3 URL for the thumbnail image (24-hour expiration).

**Response:**
```json
{
  "url": "https://s3.amazonaws.com/bucket/thumbnails/..."
}
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/documents/1/thumbnail-url
```

### Conversation

#### Send Message

```bash
POST /api/conversation/message
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_id": "your-session-id",
  "content": "Can you help me understand my lab results?",
  "document_id": null
}
```

**Response:**
```json
{
  "user_message": {
    "id": 1,
    "role": "user",
    "content": "Can you help me understand my lab results?",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": null
  },
  "assistant_message": {
    "id": 2,
    "role": "assistant",
    "content": "I'd be happy to help you understand your lab results...",
    "created_at": "2025-01-15T10:00:01Z",
    "updated_at": null
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/conversation/message \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id",
    "content": "What should I ask my doctor about my medication?"
  }'
```

#### Get Conversation History

```bash
GET /api/conversation/{session_id}/history
Authorization: Bearer <token>
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "Hello, I need help...",
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": null
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "I'm here to help...",
      "created_at": "2025-01-15T10:00:01Z",
      "updated_at": null
    }
  ]
}
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/conversation/{session_id}/history
```

#### Edit Message

```bash
PATCH /api/conversation/{message_id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "Updated message content"
}
```

**Response:**
```json
{
  "id": 1,
  "content": "Updated message content",
  "updated_at": "2025-01-15T10:05:00Z"
}
```

**Example:**
```bash
curl -X PATCH http://localhost:8000/api/conversation/123 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Corrected message content"
  }'
```

**Notes:**
- Only user messages can be edited (not assistant responses)
- User must have access to the session (owner or collaborator)
- The `updated_at` field is set when a message is edited
- Edited messages display an "(edited)" indicator in the UI

### Audio Recordings

#### Upload Audio File

```bash
POST /api/conversation/transcribe
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Parameters:**
- `audio` (file): The audio file to upload
- `session_id` (string): Session ID to associate with

**Supported Audio Formats:**
- MP3 (`audio/mpeg`)
- M4A (`audio/m4a`, `audio/mp4`)
- WAV (`audio/wav`, `audio/x-wav`)
- WebM (`audio/webm`)
- OGG (`audio/ogg`)

**File Size Limit:** 20MB

**Processing:**
- **Automatic chunking**: Audio files longer than 20 minutes are automatically split into chunks, transcribed separately, and recombined
- **MP3 conversion**: All uploaded audio is converted to MP3 format for universal browser playback compatibility
- **Transcription**: Audio is transcribed using OpenAI Whisper API
- **AI categorization**: Categorized into 12 types (Doctor Visits, Treatment Discussions, Symptoms, etc.)
- **AI-generated summary**: Brief summary of audio content (user-editable, max 150 characters)
- **Journal synthesis**: Automatically creates journal entry if content is medically relevant

**Response:**
```json
{
  "id": 1,
  "session_id": "your-session-id",
  "filename": "doctor_appointment.m4a",
  "s3_key": "audio/session-id/timestamp_uuid_doctor_appointment.mp3",
  "content_type": "audio/mpeg",
  "duration_seconds": 1234.5,
  "transcribed_text": "Full transcription of the audio recording...",
  "category": "DOCTOR_VISIT",
  "ai_summary": "Discussion about blood pressure medication adjustments",
  "uploaded_at": "2025-01-15T10:00:00Z"
}
```

**Notes:**
- Long audio files (>20 minutes, up to OpenAI's limit) are automatically chunked into 20-minute segments
- Original format is converted to MP3 and stored in S3 for browser playback
- Transcription handles multi-chunk audio seamlessly
- Maximum audio duration: approximately 23 minutes per chunk (OpenAI Whisper limit)

**Example:**
```bash
curl -X POST http://localhost:8000/api/conversation/transcribe \
  -H "Authorization: Bearer <token>" \
  -F "audio=@doctor_visit.m4a" \
  -F "session_id=your-session-id"
```

#### Get Session Audio Recordings

```bash
GET /api/audio-recordings/{session_id}
Authorization: Bearer <token>
```

**Query Parameters (optional):**
- `category` (string): Filter by category (e.g., "DOCTOR_VISIT", "all")
- `search` (string): Search by filename or AI summary

**Response:**
```json
[
  {
    "id": 1,
    "session_id": "your-session-id",
    "filename": "appointment_recording.mp3",
    "s3_key": "audio/session-id/timestamp_uuid_appointment.mp3",
    "duration_seconds": 450.2,
    "transcribed_text": "Full transcription...",
    "category": "DOCTOR_VISIT",
    "ai_summary": "Cardiology follow-up discussion",
    "uploaded_at": "2025-01-15T10:00:00Z"
  }
]
```

**Example:**
```bash
# Get all audio recordings
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/audio-recordings/{session_id}

# Filter by category
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/audio-recordings/{session_id}?category=DOCTOR_VISIT"

# Search recordings
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/audio-recordings/{session_id}?search=cardiology"
```

#### Get Audio Playback URL

```bash
GET /api/audio-recordings/{recording_id}/audio-url
Authorization: Bearer <token>
```

**Response:**
```json
{
  "audio_url": "https://s3.amazonaws.com/bucket/audio/..."
}
```

**Note:** Returns presigned S3 URL (24-hour expiration) for the MP3 audio file.

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/audio-recordings/1/audio-url
```

### Journal

#### Get Journal Entries

```bash
GET /api/journal/{session_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "entries_by_date": {
    "2025-01-15": [
      {
        "id": 1,
        "title": "Follow-up Appointment",
        "content": "Discussed blood pressure management...",
        "entry_type": "APPOINTMENT",
        "entry_date": "2025-01-15",
        "created_at": "2025-01-15T10:00:00Z"
      }
    ]
  }
}
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/journal/{session_id}
```

#### Create Journal Entry

```bash
POST /api/journal/{session_id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "New Medication Started",
  "content": "Started Lisinopril 10mg daily for blood pressure",
  "entry_type": "TREATMENT_CHANGE",
  "entry_date": "2025-01-15"
}
```

**Valid Entry Types:**
- `MEDICAL_UPDATE` - Medical information shared (test results, symptoms, diagnoses, clinical observations)
- `TREATMENT_CHANGE` - Changes to care approach (medication adjustments, new therapies, care plan updates)
- `APPOINTMENT` - Medical appointments (upcoming visits, appointment recaps, scheduling)
- `INSIGHT` - Observations and realizations (patterns noticed, concerns identified, caregiving reflections)
- `MILESTONE` - Significant moments (progress achieved, challenges overcome, important decisions)
- `OTHER` - Any substantive caregiving topic that doesn't fit above

**Example:**
```bash
curl -X POST http://localhost:8000/api/journal/{session_id} \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Lab Results",
    "content": "Cholesterol levels improved",
    "entry_type": "MEDICAL_UPDATE",
    "entry_date": "2025-01-15"
  }'
```

### Daily Plans

#### Get All Daily Plans

```bash
GET /api/daily-plans/{session_id}
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": 1,
    "session_id": "your-session-id",
    "date": "2025-01-15",
    "content": "## Today's Priorities\n- Follow up on lab results...",
    "user_edited_content": null,
    "viewed": true,
    "created_at": "2025-01-15T06:00:00Z",
    "updated_at": "2025-01-15T06:00:00Z"
  }
]
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/daily-plans/{session_id}
```

#### Get Latest Daily Plan

```bash
GET /api/daily-plans/{session_id}/latest
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 1,
  "session_id": "your-session-id",
  "date": "2025-01-15",
  "content": "## Today's Priorities\n- Review medication schedule\n- Prepare questions for doctor appointment\n\n## Important Reminders\n- Take morning medication with food\n- Monitor blood pressure daily\n\n## Questions for Care Team\n- Should we adjust dosage based on recent readings?\n- What lifestyle changes would be most beneficial?",
  "user_edited_content": null,
  "viewed": false,
  "created_at": "2025-01-15T06:00:00Z",
  "updated_at": "2025-01-15T06:00:00Z"
}
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/daily-plans/{session_id}/latest
```

#### Check Daily Plan Status

```bash
GET /api/daily-plans/{session_id}/check
Authorization: Bearer <token>
```

**Response:**
```json
{
  "should_generate": false,
  "latest_plan_date": "2025-01-15",
  "hours_since_last_plan": 8.5
}
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/daily-plans/{session_id}/check
```

#### Generate New Daily Plan

```bash
POST /api/daily-plans/{session_id}/generate?user_date=YYYY-MM-DD
Authorization: Bearer <token>
```

**Query Parameters:**
- `user_date` (optional): Date in YYYY-MM-DD format from user's local timezone. If not provided, uses server date.

**Requirements:**
- User must have journal entries OR conversations (sufficient data)
- Returns HTTP 400 if insufficient data exists
- **First plan**: Auto-generates after the session has been active for 24 hours
- **Subsequent plans**: Auto-generate after 2 AM local time when user becomes active (if no plan exists for today)

**Response (Success):**
```json
{
  "id": 2,
  "session_id": "your-session-id",
  "date": "2025-01-16",
  "content": "## Today's Priorities\n...",
  "user_edited_content": null,
  "viewed": false,
  "created_at": "2025-01-16T06:00:00Z",
  "updated_at": "2025-01-16T06:00:00Z"
}
```

**Response (Insufficient Data):**
```json
{
  "detail": "Insufficient data to generate daily plan. Please add journal entries or have conversations first."
}
```

**Example:**
```bash
# Without user_date (uses server date)
curl -X POST http://localhost:8000/api/daily-plans/{session_id}/generate \
  -H "Authorization: Bearer <token>"

# With user_date (recommended for timezone accuracy)
curl -X POST "http://localhost:8000/api/daily-plans/{session_id}/generate?user_date=2025-01-16" \
  -H "Authorization: Bearer <token>"
```

#### Update Daily Plan

```bash
PUT /api/daily-plans/{plan_id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_edited_content": "## Today's Priorities\n- Custom edited content..."
}
```

**Example:**
```bash
curl -X PUT http://localhost:8000/api/daily-plans/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_edited_content": "## Today's Priorities\n- Updated priorities..."
  }'
```

#### Mark Daily Plan as Viewed

```bash
PUT /api/daily-plans/{plan_id}/mark-viewed
Authorization: Bearer <token>
Content-Type: application/json
```

**Note:** View status is tracked per-user. Each collaborator has independent view tracking, ensuring the "new plan" banner shows correctly for each user until they personally view the plan.

**Request Body:**
```json
{
  "viewed": true
}
```

**Example:**
```bash
curl -X PUT http://localhost:8000/api/daily-plans/1/mark-viewed \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"viewed": true}'
```

#### Delete Daily Plan

```bash
DELETE /api/daily-plans/{plan_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Daily plan deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/daily-plans/1 \
  -H "Authorization: Bearer <token>"
```

### Tools

#### Jargon Translator

```bash
POST /api/tools/jargon-translator
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_id": "your-session-id",
  "medical_text": "The patient presents with tachycardia and hypertension"
}
```

**Response:**
```json
{
  "translation": "The patient has a faster than normal heart rate (tachycardia) and high blood pressure (hypertension)...",
  "terms_explained": [
    {
      "term": "tachycardia",
      "explanation": "A faster than normal heart rate"
    },
    {
      "term": "hypertension",
      "explanation": "High blood pressure"
    }
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/tools/jargon-translator \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id",
    "medical_text": "Patient diagnosed with hypertension"
  }'
```

#### Conversation Coach

```bash
POST /api/tools/conversation-coach
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_id": "your-session-id",
  "situation": "I have a follow-up appointment to discuss test results"
}
```

**Response:**
```json
{
  "response": "Here are some suggestions to prepare for your appointment...",
  "suggested_questions": [
    "Can you explain what these test results mean in the context of my overall health?",
    "What are the next steps in the treatment plan?",
    "Are there any lifestyle changes we should consider?"
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/tools/conversation-coach \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id",
    "situation": "Meeting with cardiologist to discuss treatment options"
  }'
```

## JavaScript/React Examples

### Authentication

```javascript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

// Create axios instance with auth interceptor
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Register new user
const register = async (name, email, password) => {
  const response = await axios.post(`${API_BASE_URL}/auth/register`, {
    name,
    email,
    password,
  });

  // Save token
  localStorage.setItem('auth_token', response.data.access_token);

  return response.data.user;
};

// Login
const login = async (email, password) => {
  const response = await axios.post(`${API_BASE_URL}/auth/login`, {
    email,
    password,
  });

  // Save token
  localStorage.setItem('auth_token', response.data.access_token);

  return response.data.user;
};

// Get current user
const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};
```

### Session Management and Sharing

```javascript
// Create or get primary session
const getSession = async () => {
  const response = await api.post('/sessions/primary');
  return response.data;
};

// List all sessions (owned and shared)
const listSessions = async () => {
  const response = await api.get('/sessions/');
  return response.data; // Includes is_owner flag and collaborators array
};

// Check if user can be added as collaborator
const checkUserForSharing = async (sessionId, email) => {
  const response = await api.post(`/sessions/${sessionId}/check-user`, { email });
  return response.data;
};

// Share session with another user
const shareSession = async (sessionId, email) => {
  const response = await api.post(`/sessions/${sessionId}/share`, { email });
  return response.data;
};

// Revoke collaborator access (owner only)
const revokeAccess = async (sessionId, userId) => {
  const response = await api.delete(`/sessions/${sessionId}/collaborators/${userId}`);
  return response.data;
};

// Leave a shared session (collaborators only)
const leaveSession = async (sessionId) => {
  const response = await api.post(`/sessions/${sessionId}/leave`);
  return response.data;
};

// Send invitation to non-user (owner only)
const sendInvitation = async (sessionId, email) => {
  const response = await api.post(`/sessions/${sessionId}/invite`, { email });
  return response.data;
};

// Get pending invitations (owner only)
const getPendingInvitations = async (sessionId) => {
  const response = await api.get(`/sessions/${sessionId}/invitations`);
  return response.data;
};

// Cancel invitation (owner only)
const cancelInvitation = async (sessionId, invitationId) => {
  const response = await api.delete(`/sessions/${sessionId}/invitations/${invitationId}`);
  return response.data;
};

// Transfer ownership (owner only, target must own <3 sessions)
const transferOwnership = async (sessionId, userId) => {
  const response = await api.post(`/sessions/${sessionId}/transfer`, { user_id: userId });
  return response.data;
};

// Usage - Share a session
const session = await getSession();
if (session.is_owner) {
  const check = await checkUserForSharing(session.id, 'family@example.com');
  if (check.exists) {
    const result = await shareSession(session.id, 'family@example.com');
    console.log(result.message); // "Session shared with Family Member"
  } else {
    console.log(check.message); // Error message explaining why
  }
}

// Usage - Leave a shared session
const sessions = await listSessions();
const sharedSession = sessions.find(s => !s.is_owner);
if (sharedSession) {
  await leaveSession(sharedSession.id);
}

// Usage - Send invitation to non-user
const check = await checkUserForSharing(session.id, 'newuser@example.com');
if (!check.exists) {
  await sendInvitation(session.id, 'newuser@example.com');
  console.log('Invitation email sent!');
}

// Usage - Transfer ownership
const collaborators = session.collaborators;
if (collaborators.length > 0) {
  const targetUser = collaborators[0];
  if (targetUser.owned_session_count < 3) {
    await transferOwnership(session.id, targetUser.user_id);
    console.log('Ownership transferred!');
  }
}
```

### Upload Document

```javascript

// Upload document
const uploadDocument = async (file, sessionId) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('session_id', sessionId);

  const response = await api.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

// Get PDF thumbnail URL
const getDocumentThumbnail = async (documentId) => {
  const response = await api.get(`/documents/${documentId}/thumbnail-url`);
  return response.data.url; // Presigned S3 URL
};

// Usage
const sessionId = await getSession();
const document = await uploadDocument(myFile, sessionId);
console.log('Extracted text:', document.extracted_text);

// If it's a PDF, get the thumbnail
if (document.content_type === 'application/pdf' && document.thumbnail_s3_key) {
  const thumbnailUrl = await getDocumentThumbnail(document.id);
  console.log('Thumbnail URL:', thumbnailUrl);
}
```

### Conversation

```javascript
// Send message
const sendMessage = async (content, sessionId, documentId = null) => {
  const response = await api.post('/conversation/message', {
    content,
    session_id: sessionId,
    document_id: documentId,
  });

  return response.data;
};

// Get conversation history
const getHistory = async (sessionId) => {
  const response = await api.get(`/conversation/${sessionId}/history`);
  return response.data.messages;
};

// Usage
const reply = await sendMessage(
  'Can you help me understand my lab results?',
  sessionId
);

console.log('User:', reply.user_message.content);
console.log('Assistant:', reply.assistant_message.content);
```

### Audio Recordings

```javascript
// Upload audio file
const uploadAudio = async (audioFile, sessionId) => {
  const formData = new FormData();
  formData.append('audio', audioFile);
  formData.append('session_id', sessionId);

  const response = await api.post('/conversation/transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

// Get all audio recordings
const getAudioRecordings = async (sessionId, category = null, search = null) => {
  const params = {};
  if (category) params.category = category;
  if (search) params.search = search;

  const response = await api.get(`/audio-recordings/${sessionId}`, { params });
  return response.data;
};

// Get audio playback URL
const getAudioUrl = async (recordingId) => {
  const response = await api.get(`/audio-recordings/${recordingId}/audio-url`);
  return response.data.audio_url; // Presigned S3 URL
};

// Usage - Upload audio file
const audioFile = new File([audioBlob], 'recording.m4a', { type: 'audio/m4a' });
const recording = await uploadAudio(audioFile, sessionId);
console.log('Transcription:', recording.transcribed_text);
console.log('AI Summary:', recording.ai_summary);
console.log('Category:', recording.category);

// Get audio playback URL
const audioUrl = await getAudioUrl(recording.id);
console.log('Play audio at:', audioUrl);

// Filter recordings by category
const doctorVisits = await getAudioRecordings(sessionId, 'DOCTOR_VISIT');
console.log('Doctor visit recordings:', doctorVisits);

// Search recordings
const searchResults = await getAudioRecordings(sessionId, null, 'cardiology');
console.log('Cardiology-related recordings:', searchResults);
```

### Daily Plans

```javascript
// Generate today's plan (with timezone support)
const generateDailyPlan = async (sessionId, userDate = null) => {
  const params = userDate ? { user_date: userDate } : {};
  const response = await api.post(`/daily-plans/${sessionId}/generate`, null, { params });
  return response.data;
};

// Helper to get user's local date in YYYY-MM-DD format
const getUserLocalDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

// Get latest plan
const getLatestPlan = async (sessionId) => {
  const response = await api.get(`/daily-plans/${sessionId}/latest`);
  return response.data;
};

// Check if new plan needed
const checkPlanStatus = async (sessionId) => {
  const response = await api.get(`/daily-plans/${sessionId}/check`);
  return response.data;
};

// Update plan with user edits
const updatePlan = async (planId, editedContent) => {
  const response = await api.put(`/daily-plans/${planId}`, {
    user_edited_content: editedContent,
  });
  return response.data;
};

// Mark plan as viewed
const markPlanViewed = async (planId) => {
  const response = await api.put(`/daily-plans/${planId}/mark-viewed`, {
    viewed: true,
  });
  return response.data;
};

// Delete daily plan
const deleteDailyPlan = async (planId) => {
  const response = await api.delete(`/daily-plans/${planId}`);
  return response.data;
};

// Usage - Generate plan with user's local timezone
const status = await checkPlanStatus(sessionId);
if (status.should_generate) {
  try {
    const userDate = getUserLocalDate(); // Get user's local date
    const newPlan = await generateDailyPlan(sessionId, userDate);
    console.log('New plan created:', newPlan.content);
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('Insufficient data to generate plan');
    }
  }
} else {
  const latestPlan = await getLatestPlan(sessionId);
  console.log('Latest plan:', latestPlan.content);
}

// Delete and regenerate with timezone support
await deleteDailyPlan(oldPlanId);
const userDate = getUserLocalDate();
const newPlan = await generateDailyPlan(sessionId, userDate);
console.log('Regenerated plan:', newPlan.content);
```

### Journal

```javascript
// Get all journal entries
const getJournalEntries = async (sessionId) => {
  const response = await api.get(`/journal/${sessionId}`);
  return response.data.entries_by_date;
};

// Create journal entry
const createJournalEntry = async (sessionId, title, content, entryType, date) => {
  const response = await api.post(`/journal/${sessionId}`, {
    title,
    content,
    entry_type: entryType,
    entry_date: date,
  });
  return response.data;
};

// Usage
const entries = await getJournalEntries(sessionId);
console.log('Entries by date:', entries);

// Valid entry types: 'MEDICAL_UPDATE', 'TREATMENT_CHANGE', 'APPOINTMENT', 'INSIGHT', 'MILESTONE', 'OTHER'
const newEntry = await createJournalEntry(
  sessionId,
  'Lab Results',
  'Cholesterol levels improved',
  'MEDICAL_UPDATE',
  '2025-01-15'
);
console.log('New entry created:', newEntry);
```

### Tools

```javascript
// Jargon Translator
const translateJargon = async (sessionId, medicalText) => {
  const response = await api.post('/tools/jargon-translator', {
    session_id: sessionId,
    medical_text: medicalText,
  });
  return response.data;
};

// Conversation Coach
const getCoaching = async (sessionId, situation) => {
  const response = await api.post('/tools/conversation-coach', {
    session_id: sessionId,
    situation,
  });
  return response.data;
};

// Usage
const translation = await translateJargon(
  sessionId,
  'Patient presents with tachycardia'
);
console.log('Translation:', translation.translation);

const coaching = await getCoaching(
  sessionId,
  'Preparing for appointment with cardiologist'
);
console.log('Suggested questions:', coaching.suggested_questions);
```

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters or insufficient data (e.g., generating daily plan without engagement)
- `403 Forbidden`: Not authorized to access resource
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

**Error Response Format:**
```json
{
  "detail": "Error message description"
}
```

**Example Error Handling:**

```javascript
try {
  const summary = await generateSummary(medicalText, sessionId);
  console.log(summary);
} catch (error) {
  if (error.response) {
    console.error('Error:', error.response.data.detail);
    console.error('Status:', error.response.status);
  } else {
    console.error('Network error:', error.message);
  }
}
```

## Rate Limiting

Currently, there are no rate limits implemented. However, be mindful of:
- OpenAI API usage limits
- AWS S3 request limits
- Server resource constraints

## Best Practices

1. **Session Management**: Create one session per user/browser session
2. **Error Handling**: Always implement proper error handling
3. **File Validation**: Validate file types and sizes before upload (20MB max for both documents and audio)
4. **Audio Uploads**: For long audio files (>20 minutes), the system automatically chunks, transcribes, and recombines - no special handling needed
5. **Privacy**: Clear sessions when done to protect user privacy - this removes ALL data from PostgreSQL and S3
6. **Context**: Provide context when using the chat or translation features
7. **Thumbnails**: Check for `thumbnail_s3_key` before requesting PDF thumbnails
8. **Audio Playback**: All uploaded audio is converted to MP3 for browser compatibility - original format doesn't matter
9. **Data Deletion**: Warn users that session deletion is permanent and removes all data including S3 files

## Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "AretaCare API"
}
```

Use this endpoint for monitoring and health checks.

## Support

For API issues or questions:
1. Check the interactive docs at `/docs`
2. Review error messages carefully
3. Check logs for detailed error information
4. Contact the development team
