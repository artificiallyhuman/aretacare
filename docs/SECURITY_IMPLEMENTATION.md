# Security Implementation Guide

Technical documentation of AretaCare's security measures.

---

## Authentication System

### Two-Token JWT Architecture

| Token Type | Lifetime | Storage | Purpose |
|------------|----------|---------|---------|
| Access Token | 1 hour | In-memory | API authentication |
| Refresh Token | 7 days max, session cookie | HttpOnly cookie | Token renewal (expires on browser close) |

**Key Files:** `backend/app/core/auth.py`, `backend/app/api/auth.py`

### Refresh Token Security

- **HttpOnly cookies**: Prevents XSS token theft (`httponly=True`, `secure=True` in production, `samesite="lax"`, `path="/api/auth"`)
- **Token rotation**: Old token revoked on each refresh, new token issued
- **Locking**: `SELECT FOR UPDATE` prevents race conditions when multiple tabs refresh
- **Token limit**: Max 5 active tokens per user; oldest auto-revoked
- **Cleanup**: Expired/revoked tokens deleted on startup

### Session Security

- **Idle timeout**: 30 minutes inactivity triggers logout with 1-minute warning
- **Cross-tab sync**: Logout in one tab immediately logs out all tabs via `storage` event
- **Dedicated logout**: `/logout` endpoint clears cookie and revokes token

### Password Security

- **Hashing**: bcrypt via passlib (12 rounds)
- **Requirements**: 8-72 characters (72 is bcrypt limit)
- **Email change**: Requires verification link to new email (1-hour expiration), notifies old email
- **Security logout**: All tokens revoked on password/email change

---

## Multi-Factor Authentication (MFA)

### Supported Methods

| Method | Description | Max Per User |
|--------|-------------|--------------|
| Passkeys (WebAuthn) | Biometrics/hardware keys, phishing-resistant | 10 |
| TOTP | 6-digit codes from authenticator apps | 1 |
| Backup Codes | One-time recovery codes | 10 |

**Key Files:** `backend/app/api/mfa.py`, `backend/app/services/mfa_service.py`, `backend/app/core/mfa_config.py`

### Security Features

| Feature | Implementation |
|---------|----------------|
| TOTP Secrets | Fernet encrypted at rest (key derived from SECRET_KEY via PBKDF2) |
| TOTP Replay Protection | `last_used_counter` prevents code reuse within same time window |
| Backup Codes | bcrypt hashed, never stored plaintext |
| Trusted Devices | 30-day duration, SHA-256 hashed tokens, max 10 (FIFO cleanup) |
| MFA Challenges | 5-minute expiration |
| Action Tokens | Single-use, 5-minute expiry for sensitive actions |

### Sensitive Action Protection

Password change, email change, and account deletion require MFA re-verification when MFA is enabled. Flow:
1. Request action → Server returns `MFA_REQUIRED`
2. User verifies with passkey/TOTP/backup code
3. Server returns single-use `action_token` (5-min expiry)
4. Client retries with `X-MFA-Action-Token` header

### Email Notifications

MFA events trigger emails: MFA enabled/disabled, new passkey added, new trusted device, MFA reset by admin.

### Account Recovery

If a user loses access to all MFA methods, an admin can reset their MFA from the admin console (Users → search → Reset MFA). This removes all MFA methods and notifies the user via email.

---

## Account Lockout

| Setting | Value |
|---------|-------|
| Failed attempts before lockout | 5 |
| Time window for counting | 15 minutes |
| Lockout duration | 15 minutes |

**Key design decision:** Lockout is based on email address only, not IP address. This prevents attackers from bypassing lockout by changing IPs (distributed attacks). IP is logged for auditing but not used in lockout calculation.

Progressive warnings shown after 4th failed attempt.

### MFA Lockout

Separate from login lockout, MFA verification has its own lockout mechanism:

| Setting | Value |
|---------|-------|
| Failed MFA attempts before lockout | 5 |
| Time window for counting | 15 minutes |
| Lockout duration | 15 minutes |

Excessive MFA failures trigger a security alert email. This prevents brute-force attacks against MFA codes while allowing legitimate retries.

### Account Enumeration Prevention

Registration returns identical responses regardless of whether an email already exists. This prevents attackers from discovering which emails have accounts.

---

## Rate Limiting

Implemented via `slowapi`. See `backend/app/core/rate_limit.py`.

| Endpoint | Limit |
|----------|-------|
| Login | 6/minute |
| Registration | 3/hour |
| Password Reset | 3/hour |
| MFA Verification | 3/minute |
| File Upload | 10/minute (docs), 5/minute (audio) |
| AI Chat | 30/minute |
| Feedback | 3/hour |
| Admin Destructive | 5/hour (delete user, delete session, S3 cleanup) |
| Admin Sensitive | 10/hour (reset password, reset MFA, transfer) |
| Admin Email | 20/hour (invitations, notifications) |
| General API | 100/minute |

---

## Input Validation

- **Pydantic schemas**: All API inputs validated (type, length, format)
- **Session names**: Alphanumeric + spaces, hyphens, underscores, apostrophes only (`^[a-zA-Z0-9\s\-_']+$`)
- **Feedback form**: HTML-escaped via `html.escape()`

---

## File Upload Security

| Measure | Implementation |
|---------|----------------|
| Content-Disposition | `attachment` header forces download, prevents browser execution |
| File validation | MIME type + extension checking |
| Size limit | 30MB documents, 100MB audio (OpenAI file URL limit is 32MB; audio is transcribed first) |
| Image validation | PIL verification |
| S3 encryption | AES-256 server-side |

Supported types: PDF, PNG, JPG, TXT (documents); MP3, M4A, WAV, WebM, OGG (audio)

---

## Authorization & Access Control

### Session Access

`check_session_access()` in `backend/app/api/permissions.py` validates:
1. User is session owner, OR
2. User is session collaborator

Unauthorized access attempts are logged.

### Admin Access

Email must be in `ADMIN_EMAILS` env var. Frontend always verifies with server (no client-side caching).

**User Management Capabilities:**
- Search users by email
- View user details (sessions, MFA status, active tokens)
- Reset user password (sends reset email)
- Reset user MFA (disables MFA, removes all methods, notifies user via email)
- Revoke user sessions (logout from all devices)
- Delete user account

All admin actions are logged to the audit log.

---

## Data Protection

| Category | Implementation |
|----------|----------------|
| In Transit | TLS/SSL (HTTPS) |
| At Rest (S3) | AES-256 server-side encryption |
| Passwords | bcrypt hashing |
| SQL Injection | SQLAlchemy ORM with parameterized queries |
| XSS Prevention | ReactMarkdown for safe rendering |

### Complete Data Deletion

User/session deletion removes all database records (cascading) + S3 files (documents, thumbnails, audio).

### Consent Recording

All user consents are recorded in `consent_records` table for compliance verification (GDPR, CCPA/CPRA).

| Field | Purpose |
|-------|---------|
| `consent_type` | Type of consent (registration, sharing) |
| `consent_version` | Version number for tracking text changes |
| `consent_text` | Exact text user agreed to |
| `ip_address` | Client IP at time of consent |
| `user_agent` | Browser/device info |
| `created_at` | Timestamp |
| `session_id` | For sharing consents: which session |
| `shared_with_email` | For sharing consents: who received access |

**Consent Types:**
- Registration: `MEDICAL_ADVICE`, `HIPAA`, `DATA_PROCESSING`, `TERMS_PRIVACY`, `AGE_USE`
- Sharing: `SHARING_AUTHORIZATION` (recorded when owner shares session or sends invitation)

**Key Files:** `backend/app/models/consent_record.py` (includes `CONSENT_VERSIONS` dict)

---

## Security Logging

| Event Type | Retention |
|------------|-----------|
| `failed_login` | 90 days |
| `invalid_token` | 90 days |
| `unauthorized_access` | 90 days |
| `account_lockout` | 90 days |
| `upload_failure` | 90 days |

Admin console includes AI-powered daily reports analyzing logs for security patterns.

---

## Security Headers

Security headers are applied at two levels:

### Cloudflare Transform Rules (Frontend)

Applied to all frontend static content via Cloudflare Modify Response Header rules:

| Header | Value |
|--------|-------|
| X-Frame-Options | `SAMEORIGIN` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | Restricts accelerometer, camera, geolocation, gyroscope, magnetometer, payment, USB; allows microphone for audio recording |
| Content-Security-Policy | See CSP details below |

### Backend Middleware (API)

Applied via `SecurityHeadersMiddleware` in `backend/app/core/security_headers.py`:

| Header | Value |
|--------|-------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` (production only) |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `SAMEORIGIN` |
| X-XSS-Protection | `1; mode=block` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | Same as Cloudflare |
| Content-Security-Policy | Same as Cloudflare |

### Content Security Policy Details

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://js.hcaptcha.com https://newassets.hcaptcha.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://api.aretacare.com https://*.amazonaws.com https://hcaptcha.com https://*.hcaptcha.com;
media-src 'self' https://*.amazonaws.com;
object-src 'self' https://*.amazonaws.com;
frame-src 'self' https://www.youtube.com https://*.amazonaws.com https://newassets.hcaptcha.com https://*.hcaptcha.com;
frame-ancestors 'self';
form-action 'self';
base-uri 'self'
```

**Note:** `unsafe-inline` is required for `script-src` because Vite injects a bootstrap script. This is a common trade-off for React/Vite applications.

---

## Frontend Security

- **Token storage**: Access token in localStorage (short-lived), refresh token in HttpOnly cookie only
- **XSS prevention**: ReactMarkdown for content rendering, no `dangerouslySetInnerHTML`
- **Credentials**: `withCredentials: true` on axios for cookie transmission

---

## CORS Configuration

```python
allow_origins=settings.cors_origins_list  # Explicit origins, not "*"
allow_credentials=True  # Required for cookies
allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
```

---

## Startup Validation

`validate_startup()` in `backend/app/main.py` runs before the app accepts requests:

| Check | Action |
|-------|--------|
| `OPENAI_API_KEY` starts with `sk-` | Error (blocks startup) |
| `AWS_ACCESS_KEY_ID` length >= 16 | Error (blocks startup) |
| `AWS_SECRET_ACCESS_KEY` length >= 20 | Error (blocks startup) |
| `S3_BUCKET_NAME` non-empty, no spaces | Error (blocks startup) |
| Database connectivity (`SELECT 1`) | Error (blocks startup) |
| `SMTP_HOST` set but `SMTP_PASSWORD` empty | Warning (startup continues) |

This prevents the app from starting with obviously broken credentials that would only fail at first use.

---

## Docker Container Security

Both backend and frontend containers run as non-root users (UID 1000):
- Backend: `appuser`
- Frontend: `node`

---

## Edge Security (Cloudflare)

- DDoS protection, WAF, bot protection
- SSL/TLS termination
- Client IP via `CF-Connecting-IP` header (used for rate limiting/logging)

---

## GitHub Security Features

Enabled: Security Policy, Security Advisories, Private Vulnerability Reporting, Dependabot Alerts, Code Scanning, Secret Scanning.
