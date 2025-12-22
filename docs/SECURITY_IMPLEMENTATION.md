# Security Implementation Guide

This document provides detailed technical documentation of all security measures implemented in AretaCare.

**Last Updated**: 2025-12-19

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
11. [Security Headers](#security-headers)
12. [Docker Container Security](#docker-container-security)
13. [Edge Security (Cloudflare)](#edge-security-cloudflare)

---

## Authentication System

### Two-Token JWT Architecture

AretaCare uses a two-token system for secure authentication:

| Token Type | Lifetime | Storage | Purpose |
|------------|----------|---------|---------|
| Access Token | 1 hour | localStorage | API authentication |
| Refresh Token | 30 days | HttpOnly cookie only | Token renewal |

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

### Refresh Token Rotation

Refresh tokens are single-use: each time a token is used to obtain a new access token, the old refresh token is revoked and a new one is issued.

```python
# backend/app/api/auth.py - /refresh endpoint
# REFRESH TOKEN ROTATION: Revoke the old token immediately
revoke_refresh_token(db, token_record.id)

# Create a NEW refresh token (rotation)
new_refresh_token, _ = create_refresh_token_record(
    db=db,
    user_id=user.id,
    device_info=device_info,
    ip_address=ip_address
)
set_refresh_token_cookie(response, new_refresh_token)
```

**Security Benefits:**
- Limits attack window if a refresh token is compromised
- Stolen tokens become invalid after first use
- Provides detection opportunity (original user's session fails)

### Refresh Token Locking

To prevent race conditions when multiple browser tabs try to refresh tokens simultaneously, the `verify_refresh_token` function uses `SELECT FOR UPDATE` to lock the token row:

```python
# backend/app/core/auth.py
def verify_refresh_token(db, raw_token: str, for_rotation: bool = False):
    query = db.query(RefreshToken).filter(
        RefreshToken.token == raw_token,
        RefreshToken.is_revoked == False,
        RefreshToken.expires_at > datetime.utcnow()
    )

    # Use FOR UPDATE lock when rotating to prevent race conditions
    if for_rotation:
        query = query.with_for_update()

    token_record = query.first()
    # ...
```

**How it prevents race conditions:**
1. Tab A calls refresh → locks the token row
2. Tab B calls refresh → waits for lock
3. Tab A revokes token, creates new one, commits → releases lock
4. Tab B acquires lock → but token is now revoked → returns 401

### Token Limit

To prevent unbounded token accumulation from multiple browser tabs or devices, the system enforces a maximum of 5 active refresh tokens per user:

```python
# backend/app/core/auth.py
MAX_ACTIVE_TOKENS_PER_USER = 5

def _enforce_token_limit(db, user_id: str):
    """
    Enforce the maximum active tokens limit for a user.
    Revokes the oldest tokens (by last_used_at, then created_at) if over the limit.
    """
    active_tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.is_revoked == False,
        RefreshToken.expires_at > datetime.utcnow()
    ).order_by(
        RefreshToken.last_used_at.asc(),
        RefreshToken.created_at.asc()
    ).all()

    tokens_to_revoke = len(active_tokens) - MAX_ACTIVE_TOKENS_PER_USER
    if tokens_to_revoke > 0:
        for token in active_tokens[:tokens_to_revoke]:
            token.is_revoked = True
            token.revoked_at = datetime.utcnow()
        db.commit()
```

**Security Benefits:**
- Prevents token accumulation from users who don't explicitly log out
- Oldest/least-used tokens are revoked first
- Users stay logged in on their most recently active sessions

### Token Cleanup

Expired and old revoked tokens are automatically deleted on application startup:

```python
# backend/app/main.py - startup_cleanup()
# Delete tokens that are:
# 1. Expired (expires_at < now), OR
# 2. Revoked more than 7 days ago
deleted_count = db.query(RefreshToken).filter(
    or_(
        RefreshToken.expires_at < now,
        (RefreshToken.is_revoked == True) & (RefreshToken.revoked_at < revoked_cutoff)
    )
).delete(synchronize_session=False)
```

**Security Benefits:**
- Reduces database bloat from accumulated tokens
- Maintains 7-day audit trail for revoked tokens
- Cleanup runs automatically on each deployment

### Idle Timeout

The frontend automatically logs users out after 30 minutes of inactivity:

```javascript
// frontend/src/components/IdleTimeout.jsx
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 60 * 1000;     // Show warning 1 minute before

// Activity events tracked: mousedown, mousemove, keydown, touchstart, scroll, click
```

**Behavior:**
1. After 29 minutes of inactivity, a warning modal appears with a countdown
2. User can click "Stay Logged In" to reset the timer
3. After 30 minutes, user is automatically logged out
4. Login page shows message explaining the idle logout

**Security Benefits:**
- Protects against session hijacking on unattended devices
- Reduces window of opportunity for physical access attacks
- Cleans up abandoned sessions automatically

### Cross-Tab Logout Sync

When a user logs out from one browser tab, all other tabs in the same browser are immediately notified and redirected to the login page:

```javascript
// frontend/src/contexts/SessionContext.jsx
useEffect(() => {
  const handleStorageChange = (event) => {
    // If auth_token was removed by another tab, log out this tab too
    if (event.key === 'auth_token' && event.newValue === null) {
      setUser(null);
      setSessions([]);
      setActiveSessionId(null);
      window.location.replace('/login');
    }
  };

  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
```

**How it works:**
- The `storage` event fires when localStorage is changed by **another** tab (not the same tab)
- When one tab logs out and removes `auth_token`, all other tabs detect this and redirect
- This prevents stale sessions from remaining active in unused tabs

**Security Benefits:**
- Ensures "logout everywhere" immediately affects all browser tabs
- Prevents users from accidentally using stale sessions
- Provides consistent logout behavior across the application

### Logout Endpoint

A dedicated `/logout` endpoint clears the HttpOnly cookie and revokes the refresh token:

```python
@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    response: Response,
    refresh_token_cookie: Optional[str] = Cookie(None, alias=REFRESH_TOKEN_COOKIE_NAME),
    db: DBSession = Depends(get_db)
):
    clear_refresh_token_cookie(response)
    if refresh_token_cookie:
        # Revoke the token in database
        token_record = db.query(RefreshToken).filter(
            RefreshToken.token == refresh_token_cookie,
            RefreshToken.is_revoked == False
        ).first()
        if token_record:
            token_record.is_revoked = True
            db.commit()
    return {"message": "Logged out successfully"}
```

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

### Email Change Verification

Email changes require verification to prevent account takeover:

1. User requests email change (password required)
2. Verification link sent to NEW email address (1-hour expiration)
3. User clicks link to complete change
4. Old email notified of the change
5. Security event logged

**Database Fields (User model):**
```python
pending_email = Column(String, nullable=True)
email_change_token = Column(String, nullable=True)
email_change_token_expires = Column(DateTime, nullable=True)
```

**API Endpoints:**
- `PUT /auth/email` - Request email change (initiates verification)
- `POST /auth/email/verify?token=...` - Complete email change
- `DELETE /auth/email/pending` - Cancel pending change

**Security Features:**
- Verification token is cryptographically secure (`secrets.token_urlsafe(32)`)
- Only one pending change allowed (new requests supersede previous)
- Pending change displayed in Settings with warning
- Token cleared from URL immediately after reading (prevents exposure in browser history)

### Security Logout on Sensitive Changes

Users are automatically logged out (all refresh tokens revoked) when:
- Requesting an email change
- Completing email verification
- Changing password

```python
# Revoke all tokens and clear cookie
revoke_all_user_tokens(db, user.id)
clear_refresh_token_cookie(response)
```

This ensures that if an attacker gains temporary access, they cannot maintain access after the legitimate user changes credentials.

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

    client.put_object(**params)
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

**Frontend Admin Verification:**

The frontend always verifies admin status with the server - no client-side caching:

```javascript
// frontend/src/contexts/AdminContext.jsx
// Always verify admin status with server - no client-side caching
// Admin authorization must be verified server-side on every check
const response = await adminAPI.checkAdmin();
setIsAdmin(response.data.is_admin);
```

**Security Benefits:**
- Prevents sessionStorage manipulation to bypass admin UI checks
- Admin status cannot be spoofed client-side
- Changes to ADMIN_EMAILS take effect immediately

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

Admins have access to comprehensive security monitoring tools:

**Daily Reports** at `/admin/report`:
- AI-powered analysis of system logs (security, error, API)
- Automated detection of concerning patterns requiring investigation
- Generates actionable insights and recommendations
- On-demand report generation for any date
- Highlights issues like failed logins, security events, API errors

**Security Logs** at `/admin/security-logs`:
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

// Refresh token is ONLY in HttpOnly cookie (not accessible to JavaScript)
// This prevents XSS attacks from stealing refresh tokens
```

**Important:** Refresh tokens are never stored in localStorage or exposed to JavaScript. They are:
- Set by the server via `Set-Cookie` header with `httponly` flag
- Automatically sent by the browser for requests to `/api/auth/*`
- Never returned in API response bodies

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

## Security Headers

All API responses include security headers via `SecurityHeadersMiddleware`:

```python
# backend/app/core/security_headers.py
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # HSTS: Force HTTPS for 1 year (production only)
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=(self), ..."
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://js.hcaptcha.com https://newassets.hcaptcha.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://*.amazonaws.com https://api.openai.com "
            "https://hcaptcha.com https://*.hcaptcha.com; "
            "frame-src 'self' https://newassets.hcaptcha.com https://*.hcaptcha.com; "
            "frame-ancestors 'self'; "
            "form-action 'self'; "
            "base-uri 'self'"
        )

        return response
```

### Headers Explained

| Header | Value | Purpose |
|--------|-------|---------|
| **Strict-Transport-Security** | `max-age=31536000; includeSubDomains` | Forces HTTPS for 1 year, prevents protocol downgrade attacks (production only) |
| **X-Content-Type-Options** | `nosniff` | Prevents MIME type sniffing attacks |
| **X-Frame-Options** | `SAMEORIGIN` | Prevents clickjacking by blocking framing from other origins |
| **X-XSS-Protection** | `1; mode=block` | Legacy XSS protection for older browsers |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | Controls referrer information sent with requests |
| **Permissions-Policy** | `camera=(), microphone=(self), ...` | Restricts browser features (allows microphone for audio recording) |
| **Content-Security-Policy** | See below | Controls resource loading, prevents XSS |

### Content Security Policy Details

The CSP is configured to be restrictive while allowing necessary functionality:

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Default: only allow resources from same origin |
| `script-src` | `'self' https://js.hcaptcha.com https://newassets.hcaptcha.com` | Scripts only from self and hCaptcha (no `unsafe-inline` or `unsafe-eval`) |
| `style-src` | `'self' 'unsafe-inline'` | Styles from self, inline styles for Tailwind CSS |
| `img-src` | `'self' data: https:` | Images from self, data URIs, and any HTTPS source |
| `connect-src` | `'self' https://*.amazonaws.com https://api.openai.com https://hcaptcha.com https://*.hcaptcha.com` | API connections |
| `frame-src` | `'self' https://newassets.hcaptcha.com https://*.hcaptcha.com` | iframes for hCaptcha |
| `frame-ancestors` | `'self'` | Prevents clickjacking |
| `form-action` | `'self'` | Forms only submit to same origin |
| `base-uri` | `'self'` | Prevents base tag injection |

**Note:** `script-src` intentionally excludes `unsafe-inline` and `unsafe-eval` to prevent XSS attacks. The application uses external script files only.

**Note:** HSTS is only enabled in production (`DEBUG=False`) to avoid locking out local development.

---

## Docker Container Security

All Docker containers run as non-root users for defense-in-depth.

### Backend Container

```dockerfile
# Dockerfile and backend/Dockerfile
# Create non-root user for security
# Using UID 1000 which is standard for first non-root user
RUN useradd --create-home --shell /bin/bash --uid 1000 appuser \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser
```

### Frontend Container

```dockerfile
# frontend/Dockerfile
# Uses built-in 'node' user (UID 1000, already exists in node:alpine)
RUN chown -R node:node /app

# Switch to non-root user
USER node
```

**Security Benefits:**
- Limits damage from container escape vulnerabilities
- Prevents processes from modifying system files
- Follows principle of least privilege
- Required by many security compliance frameworks

---

## Edge Security (Cloudflare)

AretaCare uses Cloudflare as a security and performance layer in front of the application.

### Protection Features

- **DDoS Protection**: Automatic mitigation of distributed denial-of-service attacks
- **Web Application Firewall (WAF)**: Filters malicious traffic before it reaches the application
- **Bot Protection**: Identifies and blocks malicious automated traffic
- **IP Blocking**: Ability to block specific IPs or ranges via dashboard
- **Rate Limiting**: Edge-level rate limiting in addition to application-level limits
- **SSL/TLS**: Full encryption between client and Cloudflare, and Cloudflare to origin
- **HSTS**: HTTP Strict Transport Security enforced at the edge

### Client IP Handling

The application correctly identifies client IPs when behind Cloudflare:

```python
def get_client_ip(request: Request) -> str:
    # Cloudflare sets this header with the actual client IP
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    # Fallback for non-Cloudflare requests
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host
```

This ensures rate limiting, security logging, and access controls use the real client IP, not Cloudflare's proxy IP.

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

