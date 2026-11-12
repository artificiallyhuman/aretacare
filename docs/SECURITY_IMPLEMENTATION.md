# Security Implementation Guide

Technical documentation of AretaCare's security measures.

---

## Authentication System

### Two-Token JWT Architecture

| Token Type | Lifetime | Storage | Purpose |
|------------|----------|---------|---------|
| Access Token | 1 hour | In-memory | API authentication |
| Refresh Token | 7 days max, session cookie | HttpOnly cookie (web), Keychain (iOS) | Token renewal (web cookie expires on browser close) |

Access tokens are HS256 JWTs signed and verified with PyJWT; the accepted algorithm is pinned on decode.

**Key Files:** `backend/app/core/auth.py`, `backend/app/api/auth.py`

### Refresh Token Security

- **HttpOnly cookies**: Prevents XSS token theft (`httponly=True`, `secure=True` in production, `samesite="lax"`, `path="/api/auth"`)
- **Hashed storage**: The database stores a SHA-256 hash of each refresh token (`refresh_tokens.token_hash`) and looks tokens up by that hash. Tokens are 256-bit random values, so an unsalted hash keeps the lookup indexed. `REFRESH_TOKEN_STORE_RAW` controls whether the legacy raw column is still written for rolling-deploy compatibility; set it to `FALSE` once every instance runs a release that reads the hash
- **Token rotation**: Each refresh exchanges the presented token for a new one (`claim_refresh_token_for_rotation` in `core/auth.py`). The row is locked with `SELECT FOR UPDATE` and revoked with a conditional `UPDATE`, so two concurrent requests cannot both rotate the same token
- **Rotation grace**: A token rotated within the last `REFRESH_TOKEN_ROTATION_GRACE_SECONDS` (default 30) may be exchanged again. This covers a client that never received the rotation response and two browser tabs refreshing at the same moment
- **Reuse detection**: Presenting a rotated token after the grace period is rejected and logged as a `refresh_token_reuse` security event. With `REFRESH_REUSE_REVOKES_ALL=TRUE` it also revokes every session of that user
- **Client separation**: A request is treated as native only when it carries `X-Client-Type: ios` and a refresh token in the body; the body token is then authoritative, the rotated token is returned in the body, and no cookie is set. Browsers authenticate with the cookie and never receive a refresh token in a response body
- **Access-token versioning**: Access tokens carry a `tv` claim matching `users.token_version`. Revoking all of a user's sessions increments it, so already-issued access tokens stop working at once rather than at expiry
- **Token limit**: Max 5 active tokens per user; oldest auto-revoked
- **Cleanup**: Expired/revoked tokens deleted on startup

### Session Security

- **Idle timeout**: 30 minutes inactivity triggers logout with 1-minute warning (disabled on iOS when biometric lock is enabled; token expiry provides session safeguard)
- **Cross-tab sync**: Logout in one tab immediately logs out all tabs via `storage` event
- **Dedicated logout**: `/logout` endpoint clears the cookie and revokes every refresh token presented (cookie and body)
- **Idle timeout across tabs (web)**: last activity is shared between tabs and checked against the clock when a tab regains focus, so a sleeping machine is logged out on wake

### Password Security

- **Hashing**: bcrypt via passlib (12 rounds)
- **Requirements**: 8-72 characters (72 is bcrypt limit)
- **Email change**: Requires verification link to new email (1-hour expiration), notifies old email
- **Security logout**: All refresh tokens revoked and issued access tokens invalidated on password change, password reset, email change, and "Sign Out Everywhere"; registered push-notification device tokens are removed at the same time
- **Re-entry throttling**: Routes that re-check the password for a signed-in user (`PUT /auth/name`, `PUT /auth/email`, `PUT /auth/password`, `DELETE /auth/account`) are limited to 10/minute per IP; `POST /mfa/disable` to 5/minute

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

`POST /mfa/totp/setup` returns `400` while a verified authenticator app exists. Replacing an
authenticator is therefore remove (step-up gated, above) and then set up again; setup can
never overwrite a working factor.

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
| Failed MFA attempts before lockout | 10 |
| Time window for counting | 60 minutes (rolling) |
| Security alert | after 5 failures in the window |

Failures at MFA login and at step-up verification (`POST /mfa/verify-for-action`) count toward the same limit, and both routes refuse further attempts with `429` while it is reached. This prevents brute-force attacks against MFA codes while allowing legitimate retries. Values are defined in `backend/app/services/security_service.py`.

### Account Enumeration Prevention

Registration returns identical responses regardless of whether an email already exists. This prevents attackers from discovering which emails have accounts.

---

## Rate Limiting

Implemented via `slowapi`. See `backend/app/core/rate_limit.py`.

**Client IP derivation** (`backend/app/core/client_ip.py`): a single proxy-aware resolver is used for both rate-limit keys and security logging. It honors `CF-Connecting-IP` only when the rightmost `X-Forwarded-For` hop (appended by the hosting proxy from the real TCP peer) is within Cloudflare's published ranges; otherwise it falls back to that peer address. This prevents forged forwarding headers — sent directly to the origin — from evading per-IP limits or poisoning security logs. If `CF-Connecting-IP` is present but the edge hop is unrecognized, a warning is logged (re-sync the Cloudflare ranges if it fires for legitimate traffic).

Password reset has a second, per-account throttle (see Security Logging) layered on top of the per-IP limit below. All limits are keyed by client IP.

| Endpoint | Limit |
|----------|-------|
| Login | 6/minute |
| Registration | 3/hour |
| Password Reset | 3/hour per IP (+ 3/hour per account) |
| MFA Verification | 3/minute |
| File Upload | 10/minute (docs), 10/minute (audio, incl. `/retranscribe`) |
| Presigned URL | 30/minute (document download, thumbnail, audio playback URLs) |
| AI Chat | 30/minute |
| AI Tools | 10/minute (Jargon Translator, Conversation Coach — publicly accessible, no auth required) |
| AI Generation | 6/minute and 30/hour (Health Profile update/regenerate, daily digest generate) |
| Journal Write | 30/minute (manual create/update) |
| Talk Start | 6/minute and 30/hour (`POST /talk/sessions`); Talk is also limited per user (see Talk Mode) |
| Sharing | 10/hour (share, send invitation), 10/hour (ownership transfer), 30/minute (registered-user lookup) |
| Password Re-Entry | 10/minute (name, email, password, account deletion); 5/minute (`/mfa/disable`) |
| Step-up Verification | 5/minute (`/mfa/verify-for-action`) |
| Feedback | 3/hour |
| Admin Destructive | 5/hour (delete user, delete care session, S3 cleanup) |
| Admin Sensitive | 10/hour (reset password, reset MFA, transfer) |
| Admin Email | 20/hour (invitations, notifications, campaign create/resume) |
| Unsubscribe | 20/minute (public unsubscribe endpoints — the 256-bit per-user token is the real control) |
| General API | 100/minute |

---

## Input Validation

- **Pydantic schemas**: All API inputs validated (type, length, format)
- **Request body cap**: `BodySizeLimitMiddleware` (`backend/app/core/body_limit.py`) is the outermost middleware. It rejects a declared `Content-Length` over the limit with `413` before reading the body and counts streamed bytes for chunked requests. Limits: 2MB by default; the document and audio upload routes allow their file limit plus multipart overhead. It runs before form parsing, authentication and rate limiting
- **Text length limits**: chat and edited messages 100,000 characters; Jargon Translator term 200 and context 4,000; Conversation Coach situation 8,000. The public tools also cap model output length
- **Client metadata**: `user_timezone` must be a recognised IANA zone and `current_time` a short date/time string, otherwise they are dropped
- **Care session names**: Alphanumeric + spaces, hyphens, underscores, apostrophes only (`^[a-zA-Z0-9\s\-_']+$`)
- **Feedback form**: HTML-escaped via `html.escape()`
- **Admin campaign emails**: admin-composed HTML sanitized server-side with an nh3 allowlist (tags/attributes/URL schemes) before storage and send; subjects header-sanitized (`_safe_header`)

---

## File Upload Security

| Measure | Implementation |
|---------|----------------|
| Content-Disposition | `attachment` header forces download, prevents browser execution |
| File validation | MIME type + extension checking |
| Size limit | 30MB documents, 100MB audio + 4-hour duration cap via ffprobe (OpenAI file URL limit is 32MB; audio is transcribed first) |
| Image validation | PIL verification |
| OCR | One page at a time with per-page timeouts and an overall time budget; scanned PDFs are limited to the first 100 pages and return `partial_ocr` when the budget is reached |
| Audio decoding | ffmpeg/ffprobe run with `-nostdin` and a file-only protocol whitelist, with timeouts |
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

Email must be in `ADMIN_EMAILS` env var and the account's email must be verified. Frontend always verifies with server (no client-side caching).

**Step-up for destructive actions.** When the admin has MFA enabled, these routes require a fresh `X-MFA-Action-Token` (same flow as Sensitive Action Protection): reset a user's password, reset a user's MFA, delete a user, revoke a user's tokens, transfer or delete a care session, delete orphaned S3 files, send inactive-account emails, and create or resume an email campaign. Setting `ADMIN_REQUIRE_MFA=TRUE` makes MFA mandatory for all admin access. The web client handles `MFA_REQUIRED` globally: it opens the verification dialog and replays the request with the token.

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

### AI Prompt Handling

- **Untrusted content is delimited.** Document text, OCR output, transcripts, chat turns, journal entries and profile data are wrapped with `wrap_untrusted()` (`backend/app/services/openai_service.py`) before they enter a prompt, alongside a notice that content inside the wrapper is data and not instructions. This applies to chat, the public tools, daily digests, journal synthesis and Health Profile generation.
- **Safety preamble.** Digest, journal and profile prompts carry a shared safety preamble; the chat system prompt lists the boundaries explicitly (no diagnosis, no treatment recommendations, no outcome predictions).
- **Output handling.** Markdown images are stripped from model output server-side and are not rendered by either client. Health Profile JSON produced by the model is validated against the profile schema before it is stored; invalid output fails that request and leaves the stored profile unchanged.
- **Consent.** Routes that send content to OpenAI require a recorded `AI_DATA_SHARING` consent. The tools attach care-session context, and manual journal writes create embeddings, only for users with that consent.

### Talk Mode (iOS live voice)

Talk is a live voice session on OpenAI's GPT-Live API (`backend/app/services/talk_session_service.py`,
`backend/app/api/talk.py`, `backend/app/services/talk_tools.py`).

- **No OpenAI credential on the device.** The phone sends a WebRTC offer to the backend, which creates the session with the project API key and returns the answer. The phone's data channel may send nothing and receives four event types.
- **Gating.** Feature flag (`TALK_ENABLED`), recorded `AI_DATA_SHARING` and `TALK_VOICE` consents, care-session access, and the iOS subscription entitlement verified server-side with RevenueCat (fails closed when RevenueCat cannot be reached). The web app cannot start a session by calling the API.
- **Cost limits.** One live call per user (a partial unique index, not a check-then-insert), 30 minutes per call, 60 minutes per rolling 24 hours, a silence timeout, and a per-call tool-call budget.
- **Tool access is a per-call opaque token.** The voice assistant's backend model reaches care-session data through `POST /talk/mcp`. The token is random, stored as a SHA-256 hash, valid only while its call is live, and is not a JWT: it is rejected by every other route, and access tokens are rejected by the MCP route. The care session and user come from the call's row, never from tool arguments; every record lookup repeats the care-session predicate; access is re-checked on each call so a revoked collaborator loses tools mid-conversation.
- **Writes need a spoken yes, enforced in code.** `propose_*` tools save nothing. `confirm_action` applies a proposal only if the user has been heard speaking after it was made, and each proposal can be applied once and expires after three minutes. Health Profile changes are never applied by voice: they are added to the existing review list. Deleting records, sharing, and account actions are not exposed.
- **Untrusted content.** Tool results are wrapped with `wrap_untrusted()` and stripped of markdown images; care-session context is supplied to the voice model as wrapped reference material, separate from its instructions. Both Talk prompts carry the full safety boundaries.
- **Recording.** The session runs with `store: false`. The backend receives both audio streams over a server-side connection, writes the mixed recording to S3 under the same encryption and deletion rules as uploaded audio, and removes its temporary files on every path.

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
- AI processing: `AI_DATA_SHARING` (one-time, after login), `TALK_VOICE` (one-time, before the first Talk conversation: live streaming to OpenAI and recording)

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
| `refresh_token_reuse` | 90 days |
| `mfa_login_failed`, `mfa_action_verification_failed` | 90 days |

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
- Query strings are stripped from event URLs, network breadcrumbs, and navigation breadcrumbs on the backend and web (presigned S3 links travel in query params; password-reset / email-verify / invite tokens travel in navigation `from`/`to` paths). The web client applies the same reduction to performance transactions and spans, and click breadcrumbs record only that an interaction happened, not the element's label. The iOS client reduces network breadcrumb URLs to their path
- The backend engine is created with `hide_parameters=True`, so SQL errors never include bound values
- Auth-related headers (`Authorization`, `Cookie`, MFA/trusted-device headers) are removed before send
- Stack-frame local variables are never attached on the backend (`include_local_variables=False`). The Python SDK attaches them by default, and frames up the ASGI stack hold the raw `scope`/`request` (bearer token, refresh-token cookie, MFA action token, query-string tokens) plus parsed request bodies. Neither `before_send` nor the key-based scrubber can reach them, since headers sit in byte-tuple lists
- A recursive event scrubber redacts content-bearing field names (message, journal, transcript, email, tokens, etc.)
- Backend log lines become breadcrumbs only, never standalone events (formatted log strings may embed user data)
- iOS never attaches screenshots or view hierarchy; session replay is not used on any platform
- Server-side data scrubbing and IP-storage prevention are additionally enabled in Sentry project settings as defense-in-depth
- Sentry is disabled entirely when no DSN is configured (the local-development default)

---

## Frontend Security

### Web (React)
- **Token storage**: Access token held in memory only (short-lived, 1 hour), refresh token in HttpOnly cookie only
- **Refresh handling**: Only a `401`/`403` from `/auth/refresh` signs the user out; network errors and `5xx` fail the single request and keep the session. Refreshes are serialised across tabs with the Web Locks API where available
- **Step-up handling**: A `403` with `MFA_REQUIRED` or `MFA_INVALID` from any route opens the verification dialog and replays the request once with `X-MFA-Action-Token`
- **Error rendering**: API error details are coerced to strings before display, so structured error bodies cannot break a page
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

`.dockerignore` files keep environment files, key material and certificates out of build contexts. The development Postgres port is bound to `127.0.0.1`.

---

## Dependencies & Build Integrity

- **Backend lockfile**: `backend/requirements.in` lists top-level dependencies; `backend/requirements.txt` is generated from it with `pip-compile --generate-hashes` and pins every package, including transitive ones. Images and CI install with `pip install --require-hashes`.
- **Frontend**: builds use `npm ci` against the committed `package-lock.json`.
- **Production build guard**: the web build fails if `VITE_HCAPTCHA_SITE_KEY` is not set, so a production bundle cannot ship without the real captcha key.
- **Outbound email**: SMTP uses STARTTLS with certificate verification (`ssl.create_default_context()`).
- **Database safety**: `RESET_DB` is honoured only when `DEBUG` is on and the database host is local; schema creation and migrations run under a PostgreSQL advisory lock so concurrent instance starts are serialised.

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

Runs on: push to `main`, PRs to `main`, weekly schedule (Wednesday). The Swift job creates a placeholder `Secrets.xcconfig` (no real credentials needed for static analysis) and builds with `CODE_SIGNING_ALLOWED=NO`; the build step fails the job if compilation fails.

### CI

`.github/workflows/ci.yml` runs on every pull request and push to `main` with read-only permissions:

| Job | What it runs |
|-----|--------------|
| Backend tests | `backend/tests` (pytest) against a `pgvector/pgvector:pg15` service container: health, login, care-session isolation, refresh-token behaviour, request limits, MFA guards, admin gating. No calls to OpenAI, S3 or SMTP |
| Frontend build | `npm ci` and a full production build including prerendering |
| iOS build | XcodeGen + `xcodebuild` for the simulator with code signing disabled |

Render deploys are configured to wait for these checks (`autoDeployTrigger: checksPass` in `render.yaml`).

All workflow actions are pinned to full commit SHAs; Dependabot keeps the pins current. Secret scanning (gitleaks) runs over the full history.
