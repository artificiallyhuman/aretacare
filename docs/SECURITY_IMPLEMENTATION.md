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

- **Idle timeout**: 30 minutes inactivity triggers logout with 1-minute warning (disabled on iOS when biometric lock is enabled; token expiry provides session safeguard)
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
| Passkeys (WebAuthn) | Biometrics/hardware keys, phishing-resistant. Web: `@simplewebauthn/browser`. iOS: `ASAuthorizationController` (Face ID/Touch ID) | 10 |
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
| MFA Challenges | 5-minute expiration, `SELECT FOR UPDATE` prevents concurrent verification race |
| Action Tokens | Single-use, 5-minute expiry for sensitive actions |

### Sensitive Action Protection

These actions require MFA re-verification when MFA is enabled:

| Route | Action |
|-------|--------|
| `PUT /auth/password` | Password change |
| `PUT /auth/email` | Email change |
| `DELETE /auth/account` | Account deletion |
| `DELETE /mfa/totp` | Remove authenticator app |
| `DELETE /mfa/passkeys/{id}` | Remove passkey |
| `POST /mfa/backup-codes/generate` | Regenerate backup codes |

Flow:
1. Request action → Server returns `MFA_REQUIRED`
2. User verifies with passkey/TOTP/backup code
3. Server returns single-use `action_token` (5-min expiry)
4. Client retries with `X-MFA-Action-Token` header

Factor-removal routes additionally refuse to remove the account's **last remaining factor**,
returning `400` with a plain-string detail. That guard is independent of step-up and runs
after it — without it, a user could strip their only factor while `mfa_enabled` stayed true,
locking themselves out of login.

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

**Client IP derivation** (`backend/app/core/client_ip.py`): a single proxy-aware resolver is used for both rate-limit keys and security logging. It honors `CF-Connecting-IP` only when the rightmost `X-Forwarded-For` hop (appended by the hosting proxy from the real TCP peer) is within Cloudflare's published ranges; otherwise it falls back to that peer address. This prevents forged forwarding headers — sent directly to the origin — from evading per-IP limits or poisoning security logs. If `CF-Connecting-IP` is present but the edge hop is unrecognized, a warning is logged (re-sync the Cloudflare ranges if it fires for legitimate traffic).

Password reset has a second, per-account throttle (see Security Logging) layered on top of the per-IP limit below.

| Endpoint | Limit |
|----------|-------|
| Login | 6/minute |
| Registration | 3/hour |
| Password Reset | 3/hour per IP (+ 3/hour per account) |
| MFA Verification | 3/minute |
| File Upload | 10/minute (docs), 5/minute (audio) |
| Presigned URL | 30/minute (document download, thumbnail, audio playback URLs) |
| AI Chat | 30/minute |
| AI Tools | 10/minute (Jargon Translator, Conversation Coach — publicly accessible, no auth required) |
| Feedback | 3/hour |
| Admin Destructive | 5/hour (delete user, delete care session, S3 cleanup) |
| Admin Sensitive | 10/hour (reset password, reset MFA, transfer) |
| Admin Email | 20/hour (invitations, notifications) |
| General API | 100/minute |

---

## Input Validation

- **Pydantic schemas**: All API inputs validated (type, length, format)
- **Care session names**: Alphanumeric + spaces, hyphens, underscores, apostrophes only (`^[a-zA-Z0-9\s\-_']+$`)
- **Feedback form**: HTML-escaped via `html.escape()`

---

## File Upload Security

| Measure | Implementation |
|---------|----------------|
| Content-Disposition | `attachment` header forces download, prevents browser execution |
| File validation | MIME type + extension checking |
| Size limit | 30MB documents, 100MB audio + 4-hour duration cap via ffprobe (OpenAI file URL limit is 32MB; audio is transcribed first) |
| Image validation | PIL verification |
| S3 encryption | AES-256 server-side |

Supported types: PDF, PNG, JPG, TXT (documents); MP3, M4A, WAV, WebM, OGG (audio)

---

## Authorization & Access Control

### Care Session Access

`check_session_access()` in `backend/app/api/permissions.py` validates:
1. User is care session owner, OR
2. User is care session collaborator

Unauthorized access attempts are logged.

### Admin Access

Email must be in `ADMIN_EMAILS` env var. Frontend always verifies with server (no client-side caching).

**User Management Capabilities:**
- Search users by email
- View user details (care sessions, MFA status, active tokens)
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
| XSS Prevention | ReactMarkdown (web), MarkdownUI (iOS) for safe rendering |

### Complete Data Deletion

User/care session deletion removes all database records (cascading) + S3 files (documents, thumbnails, audio).

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
| `session_id` | For sharing consents: which care session |
| `shared_with_email` | For sharing consents: who received access |

**Consent Types:**
- Registration: `MEDICAL_ADVICE`, `HIPAA`, `DATA_PROCESSING`, `TERMS_PRIVACY`, `AGE_USE`
- Sharing: `SHARING_AUTHORIZATION` (recorded when owner shares care session or sends invitation)

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
| `password_reset_requested` | 90 days |

The `password_reset_requested` event also backs the per-account reset throttle: `SecurityService.check_password_reset_throttle()` counts sent events in the trailing hour and the endpoint silently skips sending (returning the same generic response) once the per-account limit is reached. Only sent emails are counted, so throttled attempts don't extend the window.

Admin console includes AI-powered daily reports analyzing logs for security patterns.

---

## Security Headers

Security headers are applied at two levels:

### Cloudflare Transform Rules (Frontend)

Applied to all frontend static content via Cloudflare Modify Response Header rules:

| Header | Value |
|--------|-------|
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | Restricts accelerometer, camera, geolocation, gyroscope, magnetometer, payment, USB; allows microphone for audio recording |
| Content-Security-Policy | See CSP details below |

### Backend Middleware (API)

Applied via `SecurityHeadersMiddleware` in `backend/app/core/security_headers.py`:

| Header | Value |
|--------|-------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` (production only) |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| X-XSS-Protection | `1; mode=block` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | Same as Cloudflare |
| Content-Security-Policy | Same as Cloudflare |
| Cache-Control | `no-store` (+ `Pragma: no-cache`) on all `/api` responses; endpoints can opt out by setting their own value |

### Content Security Policy Details

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://js.hcaptcha.com https://newassets.hcaptcha.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://api.aretacare.com https://*.amazonaws.com https://hcaptcha.com https://*.hcaptcha.com https://*.ingest.us.sentry.io;
media-src 'self' https://*.amazonaws.com;
object-src 'self' https://*.amazonaws.com;
frame-src 'self' https://www.youtube.com https://*.amazonaws.com https://newassets.hcaptcha.com https://*.hcaptcha.com;
frame-ancestors 'self';
form-action 'self';
base-uri 'self'
```

**Note:** `unsafe-inline` is required for `script-src` because Vite injects a bootstrap script. This is a common trade-off for React/Vite applications.

---

## Error Monitoring PII Controls

Sentry is used for error/crash monitoring on all three platforms (backend, web, iOS), configured so that no health data or identifying information leaves the platform:

- `send_default_pii` disabled everywhere — no user context, no IP addresses
- Request bodies are never captured (`max_request_body_size="never"` on the backend; request data deleted in the web `beforeSend` hook)
- Query strings are stripped from event URLs and network breadcrumbs (presigned S3 links and verification tokens travel in query params)
- Auth-related headers (`Authorization`, `Cookie`, MFA/trusted-device headers) are removed before send
- A recursive event scrubber redacts content-bearing field names (message, journal, transcript, email, tokens, etc.)
- Backend log lines become breadcrumbs only, never standalone events (formatted log strings may embed user data)
- iOS never attaches screenshots or view hierarchy; session replay is not used on any platform
- Server-side data scrubbing and IP-storage prevention are additionally enabled in Sentry project settings as defense-in-depth
- Sentry is disabled entirely when no DSN is configured (the local-development default)

---

## Frontend Security

### Web (React)
- **Token storage**: Access token in localStorage (short-lived, 1 hour), refresh token in HttpOnly cookie only
- **XSS prevention**: ReactMarkdown for content rendering, no `dangerouslySetInnerHTML`. A shared link renderer (`src/utils/markdownComponents.jsx`) restricts markdown links to safe protocols (`http`/`https`/`mailto`/relative) and opens them with `target="_blank" rel="noopener noreferrer"`; it is applied to every `ReactMarkdown` usage (chat, journal, daily digest, tools, admin reports)
- **No-cache API responses**: backend marks `/api` responses `Cache-Control: no-store`, so personal data isn't retained in the browser cache
- **Credentials**: `withCredentials: true` on axios for cookie transmission
- **Send timeout**: 120-second AbortController timeout on message sends to handle slow AI responses gracefully

### iOS (SwiftUI)

**Token & Auth Security:**
- **Keychain storage**: Access/refresh tokens stored via KeychainAccess with `.afterFirstUnlockThisDeviceOnly` accessibility (prevents restoration to other devices); errors logged in DEBUG only
- **Token refresh pinning**: `AuthInterceptor` uses a dedicated `URLSession` with `CertificatePinningDelegate` for refresh requests, ensuring refresh tokens are never sent over unpinned connections
- **Passkey login (WebAuthn)**: `PasskeyAuthManager` wraps `ASAuthorizationController` for passkey assertion during MFA login. Credential data (authenticatorData, signature, clientDataJSON) is base64url-encoded and sent to backend for cryptographic verification. Requires `webcredentials` associated domain entitlement. Concurrency guard throws if a passkey operation is already in progress (prevents double-tap crashes). The backend-supplied relying-party identifier is validated against the configured frontend domain (`AppConstants.frontendBaseURL`) before use as defense-in-depth (`localhost` allowed in DEBUG).
- **Logout data cleanup**: On logout, `AuthManager` clears all `ResponseCache` instances, `ImageCache`, UserDefaults keys (`lastSessionId`, `activeTab`), and push token before clearing Keychain — prevents data leakage on shared devices. The biometric lock preference is cleared on explicit user logout only, so transient auth failures can't silently disable the lock

**Network Security:**
- **SSL certificate pinning**: `CertificatePinningDelegate` validates SHA-256 SPKI (SubjectPublicKeyInfo) public key hashes against the server certificate chain on every request, with ASN.1 DER headers for RSA-2048/4096 and EC P-256 keys (matches `openssl` output format); localhost/127.0.0.1 bypassed in DEBUG only
- **Placeholder hash detection**: Release builds trigger `assertionFailure` if pinned hashes still contain placeholder values, preventing broken production builds
- **Request timeouts**: 120s request timeout (matches web frontend), 600s for multipart uploads
- **API base URL enforcement**: Release builds crash (`fatalError`) if `API_BASE_URL` is not configured; DEBUG falls back to localhost
- **ATS**: `NSAppTransportSecurity` restricts to HTTPS in production; local networking allowed for development only
- **Authenticated file downloads**: `APIClient.downloadData()` fetches raw data with JWT auth + token refresh for endpoints like profile PDF export, preventing unauthenticated access via Safari
- **No on-disk response caching**: `APIClient`'s session sets `urlCache = nil` / `reloadIgnoringLocalCacheData` so health-data API responses aren't written to disk. S3 content (document bytes, thumbnails) is fetched via `UncachedURLSession` (no pinning — AWS chain — and no disk cache); intentional caching is in-memory only (`ResponseCache`, `ImageCache`)
- **At-rest temp-file protection & cleanup**: Downloaded documents (`DocumentsViewModel.downloadToTempFile`) and exported profiles (`ProfileViewModel.exportProfile`) are written with `.completeFileProtection`; audio recordings use `.completeUnlessOpen` (recording continues under lock). `TempFileCleanup.sweepAtLaunch()` clears stray temp files at launch; QuickLook/share/export files are deleted on sheet dismissal, and finished recordings are removed after upload

**Input Validation & Integrity:**
- **Deep link token validation**: `AretaCareApp` validates token format (non-empty, ≤256 chars, alphanumeric+hyphens/underscores) before routing universal links
- **Push payload validation**: `NotificationRouter` only acts on known `notification_type` values and requires `session_id` (when present) to be a valid UUID before routing
- **Client-side file size validation**: File size checked against `AppConstants.maxFileSizeBytes` (30MB) before upload in conversation and document views
- **Photo format detection**: `PhotosPickerItem` content type inspected via `UTType` to determine actual format (JPEG/PNG/HEIC) instead of hardcoding `.jpg`
- **Registration AutoFill**: Password fields use `.textContentType(.newPassword)` to trigger iOS strong password suggestions
- **Device integrity**: no runtime jailbreak check is shipped. The previous `DeviceIntegrityChecker` was never instantiated and has been removed rather than left as a control that appeared active but did not run. Jailbreak detection is bypassable by design and was not load-bearing for any protection.

**Session & Lifecycle Security:**
- **Biometric re-auth**: Opt-in Face ID/Touch ID lock (Settings > Security) on foreground return after 5 min background. The background timestamp is persisted to UserDefaults and checked at launch (`lockOnColdLaunchIfNeeded()` in `AretaCareApp.init`), so cold relaunches after iOS terminates the app also lock — crashes and unknown states fail locked. Uses `.deviceOwnerAuthentication` (passcode fallback). Preference cleared on explicit user logout only (survives `forceLogout`/transient auth failures). Idle timer pauses while lock screen active. Opaque lock screen hides health data.
- **Privacy overlay window**: The biometric lock screen and the app-switcher privacy shield render in a dedicated `UIWindow` above `.alert` level (`Core/Security/PrivacyShieldWindow.swift`), so they cover presented sheets and full-screen covers — an in-hierarchy overlay cannot (sheets present in a higher UIKit layer, which previously let the collaboration awareness sheet show collaborator names on top of the Face ID lock). The window intercepts all touches while lock/shield content is visible and passes touches through otherwise; the keyboard is dismissed when the overlay appears; overlay content is a VoiceOver modal so screen readers can't read covered sheets.
- **App-switcher privacy shield**: A branded shield shows whenever the scene isn't active, so the app-switcher snapshot never exposes on-screen health data. Applies to all users regardless of auth state (login/MFA screens contain personal data); content is `accessibilityHidden` while biometric-locked.
- **Idle timeout**: 30 min with 1-min warning; disabled when biometric lock is enabled (7-day token expiry serves as session safeguard); `@MainActor`-safe timer callbacks
- **APNs entitlements**: `aps-environment: development` (Debug) / `production` (Release) via per-config entitlements
- **Push token lifecycle**: Token unregistered (awaited) before auth tokens cleared during logout
- **Privacy permissions**: Camera, microphone, photo library, Face ID usage descriptions in Info.plist

**UI Security:**
- **Delete account**: Requires typing confirmation phrase + password (matches web friction)
- **Error banner**: Auto-dismisses after 8 seconds with entry/exit animations
- **Accessibility**: All icon-only buttons have `.accessibilityLabel()` for VoiceOver support

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
| `PUSH_NOTIFICATIONS_ENABLED` true but APNs keys missing | Error (blocks startup) |

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

Enabled: Security Policy, Security Advisories, Private Vulnerability Reporting, Dependabot Alerts, Code Scanning (CodeQL), Secret Scanning.

### CodeQL Code Scanning

Custom workflow at `.github/workflows/codeql.yml` (default CodeQL setup cannot build Swift):

| Language | Runner | Build |
|----------|--------|-------|
| Python | `ubuntu-latest` | Autobuild |
| JavaScript/TypeScript | `ubuntu-latest` | Autobuild |
| Swift | `macos-15` | XcodeGen + `xcodebuild` with code signing disabled |

Runs on: push to `main`, PRs to `main`, weekly schedule (Wednesday). The Swift job creates a placeholder `Secrets.xcconfig` (no real credentials needed for static analysis) and builds with `CODE_SIGNING_ALLOWED=NO`.
