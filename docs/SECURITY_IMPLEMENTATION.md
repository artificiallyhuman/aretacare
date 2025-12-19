# Security Implementation Guide

This document provides detailed technical documentation of all security measures implemented in AretaCare.

**Last Updated**: 2025-12-18

---

## Table of Contents

1. [Authentication System](#authentication-system)
2. [Account Lockout](#account-lockout)
3. [Rate Limiting](#rate-limiting)
4. [Input Validation](#input-validation)
5. [File Upload Security](#file-upload-security)
6. [Authorization & Access Control](#authorization--access-control)
7. [Data Protection](#data-protection)
8. [Security Logging](#security-logging)
9. [Frontend Security](#frontend-security)
10. [CORS Configuration](#cors-configuration)

---

## Authentication System

### Two-Token JWT Architecture

AretaCare uses a two-token system for secure authentication:

| Token Type | Lifetime | Storage | Purpose |
|------------|----------|---------|---------|
| Access Token | 1 hour | Memory/localStorage | API authentication |
| Refresh Token | 30 days | HttpOnly cookie + localStorage | Token renewal |

**Implementation Files:**
- `backend/app/core/auth.py` - Token creation and verification
- `backend/app/api/auth.py` - Authentication endpoints

### Access Tokens

```python
# Token creation (backend/app/core/auth.py)
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hour

def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = data.copy()
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
```

### Refresh Tokens with HttpOnly Cookies

Refresh tokens are stored in HttpOnly cookies to prevent XSS attacks from stealing them:

```python
# Cookie configuration (backend/app/api/auth.py)
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60  # 30 days

def set_refresh_token_cookie(response: Response, refresh_token: str):
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=REFRESH_TOKEN_MAX_AGE,
        httponly=True,      # Prevents JavaScript access
        secure=not DEBUG,   # HTTPS only in production
        samesite="lax",     # CSRF protection
        path="/api/auth"    # Scoped to auth endpoints only
    )
```

**Security Benefits:**
- `httponly=True`: JavaScript cannot access the cookie, preventing XSS token theft
- `secure=True`: Cookie only sent over HTTPS in production
- `samesite="lax"`: Prevents CSRF attacks while allowing normal navigation
- `path="/api/auth"`: Cookie only sent to authentication endpoints

### Password Security

**Hashing:** bcrypt via passlib with default 12 rounds

```python
# Password hashing (backend/app/core/auth.py)
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

**Requirements:**
- Minimum: 8 characters
- Maximum: 72 characters (bcrypt limitation)

---

## Account Lockout

Protects against brute-force attacks by temporarily locking accounts after repeated failed login attempts.

### Configuration

```python
# backend/app/services/security_service.py
LOCKOUT_THRESHOLD = 5           # Failed attempts before lockout
LOCKOUT_WINDOW_MINUTES = 15     # Time window to count attempts
LOCKOUT_DURATION_MINUTES = 15   # Lockout duration
```

### How It Works

1. **Failed Login Tracking**: Each failed login is logged with email and IP address
2. **Threshold Check**: System counts failed attempts in the last 15 minutes
3. **Progressive Warnings**: After 4 failed attempts, user sees warning about impending lockout
4. **Lockout**: After 5 failed attempts, account is locked for 15 minutes

### User Messages

| Failed Attempts | Message |
|-----------------|---------|
| 1-3 | "Incorrect email or password" |
| 4 | "Incorrect email or password. Warning: One more failed attempt will lock your account for 15 minutes. Forgot your password? Use the password reset option." |
| 5+ (locked) | "Account temporarily locked due to too many failed login attempts. Please try again in 15 minutes." |

### Implementation

```python
# backend/app/api/auth.py - Login endpoint
def login(request: Request, response: Response, user_data: UserLogin, db: DBSession):
    # Check lockout status before processing
    lockout_status = security_service.check_account_lockout(
        db=db,
        email=user_data.email,
        ip_address=ip_address
    )

    if lockout_status["is_locked"]:
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked..."
        )

    # ... authentication logic ...
```

---

## Rate Limiting

Implemented using `slowapi` to prevent abuse and DoS attacks.

### Rate Limits by Endpoint

| Endpoint Category | Limit | Purpose |
|-------------------|-------|---------|
| Login | 5/minute | Prevent brute-force |
| Registration | 3/hour | Prevent mass account creation |
| Password Reset Request | 3/hour | Prevent email spam |
| Password Reset | 5/hour | Prevent token brute-force |
| File Upload | 10/minute | Prevent storage abuse |
| Audio Upload | 5/minute | Prevent storage abuse |
| AI Chat | 30/minute | Prevent API cost abuse |
| Feedback | 3/hour | Prevent spam |
| General API | 100/minute | General protection |

### Implementation

```python
# backend/app/core/rate_limit.py
from slowapi import Limiter

limiter = Limiter(key_func=get_client_ip)

class RateLimits:
    LOGIN = "5/minute"
    REGISTER = "3/hour"
    PASSWORD_RESET_REQUEST = "3/hour"
    # ... etc
```

### Custom Error Messages

```python
def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    path = request.url.path
    if "/auth/login" in path:
        message = "Too many login attempts. Please wait a minute before trying again."
    elif "/auth/register" in path:
        message = "Too many registration attempts. Please try again later."
    # ... etc
```

---

## Input Validation

### Pydantic Schemas

All API inputs are validated using Pydantic schemas:

```python
# backend/app/schemas/auth.py
class UserRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
```

### Session Name Validation

Session names are restricted to safe characters to prevent injection attacks:

```python
# backend/app/schemas/session.py
import re

SESSION_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9\s\-_']+$")

class SessionRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=15)

    @field_validator('name')
    @classmethod
    def validate_session_name(cls, v):
        v = v.strip()
        if not SESSION_NAME_PATTERN.match(v):
            raise ValueError(
                'Session name can only contain letters, numbers, '
                'spaces, hyphens, underscores, and apostrophes'
            )
        return v
```

**Allowed Characters:**
- Letters (a-z, A-Z)
- Numbers (0-9)
- Spaces
- Hyphens (-)
- Underscores (_)
- Apostrophes (')

### Feedback Form Sanitization

User input in feedback forms is HTML-escaped:

```python
# backend/app/api/feedback.py
import html

def sanitize_input(text: str) -> str:
    return html.escape(text.strip())
```

---

## File Upload Security

### Content-Disposition Headers

All S3 uploads include Content-Disposition headers to prevent browser execution:

```python
# backend/app/services/s3_service.py
def _put_object_sync(self, key: str, file_content: bytes, content_type: str, filename: str = None):
    params = {
        'Bucket': self.bucket_name,
        'Key': key,
        'Body': file_content,
        'ContentType': content_type,
        'ServerSideEncryption': 'AES256'
    }

    # Prevent browser execution of uploaded files
    if filename:
        safe_filename = filename.replace('"', '\\"').replace('\n', '').replace('\r', '')
        params['ContentDisposition'] = f'attachment; filename="{safe_filename}"'
    else:
        params['ContentDisposition'] = 'attachment'

    self.s3_client.put_object(**params)
```

**Security Benefits:**
- Forces files to download rather than render in browser
- Prevents XSS via malicious HTML/SVG uploads
- Prevents execution of uploaded scripts

### File Validation

```python
# Document uploads
ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain"]
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

# Image validation using PIL
from PIL import Image

def validate_image(file_content: bytes) -> bool:
    try:
        img = Image.open(io.BytesIO(file_content))
        img.verify()
        return True
    except:
        return False
```

---

## Authorization & Access Control

### Session-Based Access Control

All session-scoped endpoints use centralized permission checking:

```python
# backend/app/api/permissions.py
def check_session_access(
    db: DBSession,
    session_id: str,
    user_id: str,
    request: Request = None
) -> Session:
    """
    Check if user has access to a session (owner or collaborator).
    Raises HTTPException if unauthorized.
    """
    session = db.query(Session).filter(Session.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if user is owner
    if session.owner_id == user_id:
        return session

    # Check if user is collaborator
    collaborator = db.query(SessionCollaborator).filter(
        SessionCollaborator.session_id == session_id,
        SessionCollaborator.user_id == user_id
    ).first()

    if collaborator:
        return session

    # Log unauthorized access attempt
    security_service.log_unauthorized_access(...)

    raise HTTPException(status_code=403, detail="Access denied")
```

### Admin Authorization

```python
# backend/app/api/admin.py
def get_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Verify user is an admin."""
    if current_user.email not in settings.admin_emails_list:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return current_user
```

---

## Data Protection

### Encryption

| Data State | Method |
|------------|--------|
| In Transit | TLS/SSL (HTTPS) |
| At Rest (S3) | AES-256 server-side encryption |
| Passwords | bcrypt hashing |

### SQL Injection Prevention

SQLAlchemy ORM is used throughout, which automatically parameterizes queries:

```python
# Safe - parameterized query
user = db.query(User).filter(User.email == email).first()

# Search with ILIKE (safe)
documents = db.query(Document).filter(
    Document.description.ilike(f"%{search_term}%")
).all()
```

### Complete Data Deletion

When users delete their account, all data is removed:

1. Database records (cascading deletes)
2. S3 files (documents, thumbnails, audio)

```python
# backend/app/api/auth.py - delete_account endpoint
# Delete S3 files for each session
for session in user_sessions:
    # Delete documents
    for doc in documents:
        if doc.s3_key:
            await s3_service.delete_file(doc.s3_key)
        if doc.thumbnail_s3_key:
            await s3_service.delete_file(doc.thumbnail_s3_key)

    # Delete audio recordings
    for audio in audio_recordings:
        if audio.s3_key:
            await s3_service.delete_file(audio.s3_key)

# Delete user (cascades to all related records)
db.delete(user)
db.commit()
```

---

## Security Logging

### Event Types Logged

| Event Type | Description | Retention |
|------------|-------------|-----------|
| `failed_login` | Failed login attempt | 90 days |
| `invalid_token` | Invalid/expired JWT used | 90 days |
| `unauthorized_access` | Access attempt without permission | 90 days |
| `account_lockout` | Account locked after failed attempts | 90 days |
| `upload_failure` | File upload validation failure | 90 days |

### Implementation

```python
# backend/app/services/security_service.py
class SecurityService:
    def log_event(
        self,
        db: DBSession,
        event_type: str,
        email: Optional[str] = None,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        endpoint: Optional[str] = None,
        details: Optional[str] = None
    ):
        security_log = SecurityLog(
            event_type=event_type,
            email=email,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            endpoint=endpoint,
            details=details
        )
        db.add(security_log)
        db.commit()
```

### Admin Security Dashboard

Admins can view security logs at `/admin/security-logs` with:
- Filtering by event type
- Time range selection
- IP address tracking
- User agent information

---

## Frontend Security

### XSS Prevention

React's ReactMarkdown is used for rendering user content:

```jsx
// frontend/src/components/MessageBubble.jsx
import ReactMarkdown from 'react-markdown';

<ReactMarkdown>
    {message.content}
</ReactMarkdown>
```

ReactMarkdown automatically escapes HTML, preventing XSS attacks.

### No dangerouslySetInnerHTML

The codebase does not use `dangerouslySetInnerHTML`, which could enable XSS.

### Token Storage

```javascript
// frontend/src/services/api.js
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,  // Send HttpOnly cookies
});

// Access token stored in localStorage (short-lived, acceptable risk)
localStorage.setItem('auth_token', access_token);

// Refresh token in HttpOnly cookie (secure, not accessible to JS)
```

---

## CORS Configuration

```python
# backend/app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # Explicit origins only
    allow_credentials=True,                     # Required for cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Requested-With",
    ],
)
```

**Key Settings:**
- `allow_origins`: Explicit list, not `*` (required for credentials)
- `allow_credentials=True`: Enables HttpOnly cookie transmission
- Explicit methods and headers (principle of least privilege)

---

## GitHub Security Features

The following GitHub security features are enabled for this repository:

| Feature | Description |
|---------|-------------|
| **Security Policy** | Defines how to securely report security vulnerabilities |
| **Security Advisories** | Allows viewing and disclosing security advisories |
| **Private Vulnerability Reporting** | Allows users to privately report potential security vulnerabilities |
| **Dependabot Alerts** | Notifications when dependencies have known vulnerabilities |
| **Code Scanning Alerts** | Automatic detection of common vulnerabilities and coding errors |
| **Secret Scanning Alerts** | Notifications when secrets are accidentally pushed to the repository |

