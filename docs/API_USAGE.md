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
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/sessions/{session_id}
```

### Documents

#### Upload Document

```bash
POST /api/documents/upload
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (file): The document to upload
- `session_id` (string, optional): Session ID to associate with

**Response:**
```json
{
  "id": 1,
  "filename": "medical_report.pdf",
  "content_type": "application/pdf",
  "uploaded_at": "2025-01-15T10:00:00Z",
  "extracted_text": "Extracted text content..."
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@medical_report.pdf" \
  -F "session_id=your-session-id"
```

#### Get Session Documents

```bash
GET /api/documents/session/{session_id}
```

**Example:**
```bash
curl http://localhost:8000/api/documents/session/{session_id}
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
    "created_at": "2025-01-15T10:00:00Z"
  },
  "assistant_message": {
    "id": 2,
    "role": "assistant",
    "content": "I'd be happy to help you understand your lab results...",
    "created_at": "2025-01-15T10:00:01Z"
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
      "created_at": "2025-01-15T10:00:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "I'm here to help...",
      "created_at": "2025-01-15T10:00:01Z"
    }
  ]
}
```

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/conversation/{session_id}/history
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
        "entry_type": "appointment",
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
  "entry_type": "medication",
  "entry_date": "2025-01-15"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/journal/{session_id} \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Lab Results",
    "content": "Cholesterol levels improved",
    "entry_type": "test_result",
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
POST /api/daily-plans/{session_id}/generate
Authorization: Bearer <token>
```

**Requirements:**
- User must have journal entries OR conversations (sufficient data)
- Returns HTTP 400 if insufficient data exists

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
curl -X POST http://localhost:8000/api/daily-plans/{session_id}/generate \
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

### Create Session and Upload Document

```javascript
// Create or get primary session
const getSession = async () => {
  const response = await api.post('/sessions/primary');
  return response.data.id;
};

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

// Usage
const sessionId = await getSession();
const document = await uploadDocument(myFile, sessionId);
console.log('Extracted text:', document.extracted_text);
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

### Daily Plans

```javascript
// Generate today's plan
const generateDailyPlan = async (sessionId) => {
  const response = await api.post(`/daily-plans/${sessionId}/generate`);
  return response.data;
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

// Usage
const status = await checkPlanStatus(sessionId);
if (status.should_generate) {
  try {
    const newPlan = await generateDailyPlan(sessionId);
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

// Delete and regenerate
await deleteDailyPlan(oldPlanId);
const newPlan = await generateDailyPlan(sessionId);
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

const newEntry = await createJournalEntry(
  sessionId,
  'Lab Results',
  'Cholesterol levels improved',
  'test_result',
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
3. **File Validation**: Validate file types and sizes before upload
4. **Privacy**: Clear sessions when done to protect user privacy
5. **Context**: Provide context when using the chat or translation features

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
