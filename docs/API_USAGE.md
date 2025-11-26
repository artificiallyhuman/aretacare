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

Currently, AretaCare uses session-based identification without user authentication. Each session is identified by a unique session ID.

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

### Medical Features

#### Generate Medical Summary

```bash
POST /api/medical/summary
Content-Type: application/json
```

**Request Body:**
```json
{
  "medical_text": "Patient presents with...",
  "session_id": "your-session-id"
}
```

**Response:**
```json
{
  "summary": "The patient has...",
  "key_changes": [
    "Blood pressure elevated to 140/90",
    "New medication prescribed"
  ],
  "recommended_questions": [
    "What are the expected side effects of this medication?",
    "How often should blood pressure be monitored?",
    "When should we schedule a follow-up?"
  ],
  "family_notes": "Continue monitoring blood pressure daily and maintain medication schedule."
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/medical/summary \
  -H "Content-Type: application/json" \
  -d '{
    "medical_text": "Patient presents with elevated blood pressure...",
    "session_id": "your-session-id"
  }'
```

#### Translate Medical Jargon

```bash
POST /api/medical/translate
Content-Type: application/json
```

**Request Body:**
```json
{
  "medical_term": "tachycardia",
  "context": "Patient experiencing tachycardia during exercise"
}
```

**Response:**
```json
{
  "term": "tachycardia",
  "explanation": "Tachycardia means a faster than normal heart rate...",
  "context_note": "Please confirm this explanation with your healthcare provider..."
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/medical/translate \
  -H "Content-Type: application/json" \
  -d '{
    "medical_term": "hypertension",
    "context": "Patient diagnosed with hypertension"
  }'
```

#### Get Conversation Coaching

```bash
POST /api/medical/coach
Content-Type: application/json
```

**Request Body:**
```json
{
  "situation": "I have a follow-up appointment to discuss test results",
  "session_id": "your-session-id"
}
```

**Response:**
```json
{
  "suggested_questions": [
    "Can you explain what these test results mean?",
    "What are the next steps in the treatment plan?",
    "Are there any lifestyle changes we should consider?"
  ],
  "preparation_tips": [
    "Write down your questions beforehand",
    "Bring a list of current medications",
    "Take notes during the conversation"
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/medical/coach \
  -H "Content-Type: application/json" \
  -d '{
    "situation": "Meeting with cardiologist to discuss treatment options",
    "session_id": "your-session-id"
  }'
```

#### Chat with AI Assistant

```bash
POST /api/medical/chat
Content-Type: application/json
```

**Request Body:**
```json
{
  "content": "Can you help me understand what these lab results mean?",
  "session_id": "your-session-id"
}
```

**Response:**
```json
{
  "id": 1,
  "role": "assistant",
  "content": "I'd be happy to help you understand your lab results...",
  "created_at": "2025-01-15T10:00:00Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/medical/chat \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What questions should I ask about my medication?",
    "session_id": "your-session-id"
  }'
```

#### Get Conversation History

```bash
GET /api/medical/conversation/{session_id}
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "Hello, I need help understanding...",
      "created_at": "2025-01-15T10:00:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "I'm here to help you...",
      "created_at": "2025-01-15T10:00:01Z"
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:8000/api/medical/conversation/{session_id}
```

## JavaScript/React Examples

### Create Session and Upload Document

```javascript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

// Create session
const createSession = async () => {
  const response = await axios.post(`${API_BASE_URL}/sessions/`);
  return response.data.id;
};

// Upload document
const uploadDocument = async (file, sessionId) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('session_id', sessionId);

  const response = await axios.post(
    `${API_BASE_URL}/documents/upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data;
};

// Usage
const sessionId = await createSession();
const document = await uploadDocument(myFile, sessionId);
console.log('Extracted text:', document.extracted_text);
```

### Generate Medical Summary

```javascript
const generateSummary = async (medicalText, sessionId) => {
  const response = await axios.post(
    `${API_BASE_URL}/medical/summary`,
    {
      medical_text: medicalText,
      session_id: sessionId,
    }
  );

  return response.data;
};

// Usage
const summary = await generateSummary(
  'Patient presents with elevated blood pressure...',
  sessionId
);

console.log('Summary:', summary.summary);
console.log('Key Changes:', summary.key_changes);
console.log('Questions:', summary.recommended_questions);
```

### Chat Interface

```javascript
const sendChatMessage = async (message, sessionId) => {
  const response = await axios.post(
    `${API_BASE_URL}/medical/chat`,
    {
      content: message,
      session_id: sessionId,
    }
  );

  return response.data;
};

// Usage
const reply = await sendChatMessage(
  'Can you help me understand my lab results?',
  sessionId
);

console.log('Assistant:', reply.content);
```

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters
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
