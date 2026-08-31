# AretaCare API Reference

Base URL: `http://localhost:8000/api` (dev) or `https://your-backend.onrender.com/api` (prod)

Interactive docs: `/docs` (Swagger) or `/redoc` (ReDoc)

> **Caching:** All `/api` responses are returned with `Cache-Control: no-store` because they carry personal data. Clients must not rely on HTTP caching of API responses; cache deliberately on the client side instead.

## Authentication

JWT-based auth with access tokens (1 hour) + refresh tokens (7 days max, session cookie that expires on browser close). iOS clients receive tokens in the response body (stored in Keychain) via the `X-Client-Type: ios` header.

### Register
```bash
POST /api/auth/register
```
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123",
  "acknowledge_not_medical_advice": true,
  "acknowledge_hipaa": true,
  "acknowledge_ai_processing": true,
  "agree_to_terms": true,
  "acknowledge_age_and_use": true,
  "invitation_token": null
}
```
Requires email verification before login. `invitation_token` is optional (for users invited as care session collaborators — bypasses waitlist).

### Login
```bash
POST /api/auth/login
```
Returns `access_token` + sets HttpOnly refresh cookie. If MFA enabled and device is not trusted, returns `requires_mfa: true` with `mfa_token` and `mfa_methods` array.

iOS clients (with `X-Client-Type: ios` header) also receive `refresh_token` in the response body. Web clients receive `null`.

### Verify MFA (when required)
```bash
POST /api/auth/login/mfa-verify
```
```json
{
  "mfa_token": "temporary-mfa-token",
  "method": "totp",
  "code": "123456",
  "trust_device": true
}
```
Supported methods: `totp`, `passkey`, `backup_code`.

### Other Auth Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/me` | GET | Get current user |
| `/auth/refresh` | POST | Refresh access token |
| `/auth/logout` | POST | End current session |
| `/auth/logout-everywhere` | POST | End all active sign-ins |
| `/auth/verify-email?token=` | GET | Verify email |
| `/auth/resend-verification` | POST | Resend verification (1/min) |
| `/auth/password/reset-request` | POST | Request password reset |
| `/auth/password/reset` | POST | Complete password reset |
| `/auth/email` | PUT | Request email change (requires MFA if enabled) |
| `/auth/email/verify?token=` | POST | Complete email change |
| `/auth/consent/ai-data-sharing` | POST | Record AI data sharing consent (one-time, returns `{status: "consented"}`) |

**Token Usage:** Include `Authorization: Bearer <token>` header on all authenticated requests.

---

## Multi-Factor Authentication

### MFA Status
```bash
GET /api/mfa/status
```
Returns: `mfa_enabled`, `has_passkey`, `passkey_count`, `has_totp`, `backup_code_count`, `trusted_device_count`

### Setup TOTP
```bash
POST /api/mfa/totp/setup     # Returns QR code
POST /api/mfa/totp/verify-setup  # Body: {"code": "123456"}
```

### Passkeys
```bash
POST /api/mfa/passkey/register/options  # Get WebAuthn options
POST /api/mfa/passkey/register/verify   # Complete registration
GET  /api/mfa/passkeys                  # List passkeys
DELETE /api/mfa/passkeys/{id}           # Delete passkey
```

### Backup Codes
```bash
POST /api/mfa/backup-codes/generate  # Returns 10 codes (invalidates previous)
GET  /api/mfa/backup-codes/count     # Get remaining count
```

### Trusted Devices
```bash
GET    /api/mfa/trusted-devices       # List devices
DELETE /api/mfa/trusted-devices/{id}  # Revoke device
DELETE /api/mfa/trusted-devices       # Revoke all
```

### Enable/Disable MFA
```bash
POST /api/mfa/enable   # Body: {"preferred_method": "passkey"}
POST /api/mfa/disable  # Body: {"password": "..."}  (removes all MFA data)
```

### Verify for Sensitive Actions
```bash
POST /api/mfa/verify-for-action
```
```json
{
  "method": "totp",
  "code": "123456",
  "action_type": "password_change"
}
```
Action types: `password_change`, `email_change`, `account_delete`

Returns `action_token` — include as `X-MFA-Action-Token` header when performing the action. Single-use, expires in 5 minutes.

**Which routes require it.** `PUT /auth/email`, `PUT /auth/password` and `DELETE /auth/account`
require step-up whenever the account has MFA enabled; the check runs *before* the password is
verified, so a missing token 403s regardless of the password supplied. Failures return
`403 {"detail": {"code": "MFA_REQUIRED" | "MFA_INVALID", "message": ...}}`.

The MFA factor-management routes (`DELETE /mfa/totp`, `DELETE /mfa/passkeys/{id}`,
`POST /mfa/backup-codes/generate`) **also require step-up**. Regenerating backup codes is
included because it returns ten usable second factors in the response body, so it is at
least as sensitive as removing one.

Step-up runs *before* the last-factor check, so removing your only remaining factor returns
`403` until you verify and `400` afterwards. That `400` carries a plain-string detail
(`"This is your only remaining two-factor method…"`) rather than the `{code, message}` shape.

Clients that understand `MFA_REQUIRED` never surface the message — they present their
step-up UI and replay the call with a token. For that reason the message sent to iOS callers
(`X-Client-Type: ios`) additionally suggests updating the app, since the only iOS clients
that display it are builds older than 1.0.9, which cannot satisfy the challenge.

## AI data sharing consent

Seven routes require a recorded `AI_DATA_SHARING` consent because they send content to OpenAI:
`POST /conversation/message`, `POST /conversation/transcribe`,
`POST /audio-recordings/{session_id}/{recording_id}/retranscribe`, `POST /documents/upload`,
`POST /daily-plans/{id}/generate`, `POST /profile/{id}/update`, `POST /profile/{id}/regenerate`.

Without it they return `403 {"detail": {"code": "AI_DATA_SHARING_CONSENT_REQUIRED", ...}}`.
Record it via `POST /auth/consent/ai-data-sharing`. Read, export and delete routes are never
gated — a user must always be able to see and remove their own data.

---

## Care Sessions

### List/Create Care Sessions
```bash
GET  /api/sessions/          # List all (owned + shared)
POST /api/sessions/          # Create new care session
POST /api/sessions/primary   # Get or create primary care session
```

### Care Session Management
```bash
GET    /api/sessions/{id}           # Get care session details
PUT    /api/sessions/{id}           # Rename: {"name": "New Name"}
DELETE /api/sessions/{id}           # Delete (owner only, removes all data + S3)
```

### Sharing
```bash
POST   /api/sessions/{id}/check-user                   # Check if user can be added
POST   /api/sessions/{id}/share                        # Add existing user as collaborator
DELETE /api/sessions/{id}/collaborators/{user_id}      # Remove collaborator
POST   /api/sessions/{id}/leave                        # Leave shared care session
POST   /api/sessions/{id}/send-invitation              # Invite non-user (sends registration email, bypasses waitlist)
GET    /api/sessions/{id}/pending-invitations          # List pending invitations
DELETE /api/sessions/{id}/pending-invitations/{id}     # Cancel invitation
POST   /api/sessions/{id}/transfer                     # Transfer ownership
```

---

## Documents

### Upload
```bash
POST /api/documents/upload?session_id={uuid}&user_date=2025-01-15&skip_journal_synthesis=false
Content-Type: multipart/form-data
```
The multipart body contains only `file`. Parameters `session_id`, `user_date`, and `skip_journal_synthesis` are **query parameters** (not form fields).

Supported: PDF, PNG, JPG, TXT (30MB max). Auto-categorizes into 14 categories.

### Check for Duplicates
```bash
POST /api/documents/check-duplicate
```
```json
{"session_id": "uuid", "filenames": ["lab_results.pdf", "scan.png"]}
```
Returns matching documents within the care session:
```json
{"duplicates": [{"id": 42, "filename": "lab_results.pdf", "uploaded_at": "...", "category": "lab_results"}]}
```

### Manage
```bash
GET    /api/documents/session/{session_id}              # List documents (?category=&search=&date=YYYY-MM-DD)
GET    /api/documents/session/{session_id}/dates         # Dates with document counts (for calendar)
GET    /api/documents/{id}                               # Get document
PATCH  /api/documents/{id}                               # Update category/description
DELETE /api/documents/{id}                               # Delete
GET    /api/documents/{id}/media-url                     # Get presigned URL
GET    /api/documents/{id}/thumbnail-url                 # Get thumbnail URL (PDFs)
```

---

## Audio Recordings

### Upload/Record
```bash
POST /api/conversation/transcribe
Content-Type: multipart/form-data
```
Parameters: `audio`, `session_id`, `skip_journal_synthesis` (`"true"` for conversation recordings), `background` (`"true"` — see below)

Supported: MP3, M4A, WAV, WebM, OGG (100MB max, 4 hours max duration). The original upload is
stored in S3 and the recording row committed as `processing` **before the response**, so a
worker death never loses an upload. Transcoding to MP3, transcription (20-minute chunks), AI
categorization and journal synthesis then run in a background job — the request itself takes
seconds regardless of recording length (Cloudflare drops any request without an origin response
after ~100s, and transcoding an hour-long file alone can take that long).

- `background=true` → **202** `{recording_id, filename, duration, audio_s3_key, transcription_status: "processing", transcribed_text: null}`.
  Poll `GET /api/audio-recordings/{session_id}/{recording_id}` until `transcription_status` is
  `completed` (transcript in `transcribed_text`) or `failed`. `duration` is null until the job
  has probed the MP3 for containers without metadata (MediaRecorder webm).
- `background` omitted → legacy synchronous contract kept for iOS ≤ 1.0.9 (which cannot be
  updated ahead of App Store review): waits inline for the same job up to ~80s and returns
  `{transcribed_text, audio_s3_key, filename, recording_id, duration, transcription_status: "completed"}`.
  If the recording needs longer, **400** *"This recording is long and is still being
  transcribed…"* while the job carries on. Will be removed once those builds are gone from
  Sentry's release breakdown.

`failed` means the recording is saved and playable but has no transcript — retry it with
`/retranscribe` below. A `processing` row whose job died (deploy, instance kill) is reported as
`failed` once its heartbeat is 20 minutes old. Until the job has swapped in the MP3, the playback
URL serves the original container with its own content type.

### Manage
```bash
GET    /api/audio-recordings/{session_id}                       # List (?category=&search=&date=YYYY-MM-DD)
GET    /api/audio-recordings/{session_id}/dates                  # Dates with recording counts (for calendar)
GET    /api/audio-recordings/{session_id}/{recording_id}         # Get recording
PATCH  /api/audio-recordings/{session_id}/{recording_id}         # Update category/summary (absent field = no change; explicit null clears)
DELETE /api/audio-recordings/{session_id}/{recording_id}         # Delete
GET    /api/audio-recordings/{session_id}/{recording_id}/url     # Get playback URL
POST   /api/audio-recordings/{session_id}/{recording_id}/retranscribe  # Retry a failed transcription → 202 (409 unless failed); audio-upload rate limit
```

`/retranscribe` answers 202 immediately (the job fetches the stored audio itself) and its
`audio_s3_key` is the key the recording ends up under after the MP3 swap. Exactly one retry
wins per recording: a concurrent second request gets the 409.

---

## Conversation

### Send Message
```bash
POST /api/conversation/message
```
```json
{
  "session_id": "uuid",
  "content": "Your message",
  "document_id": null,
  "audio_recording_id": null,
  "entry_date": "2025-01-15",
  "user_timezone": "America/New_York",
  "current_time": "2:30 PM"
}
```
Returns both `user_message` and `assistant_message`. In shared sessions, also sends push notifications to collaborators.

### History & Edit
```bash
GET   /api/conversation/{session_id}/history?limit=50&offset=0              # Get messages (offset pagination)
GET   /api/conversation/{session_id}/history?limit=50&before_id=1234        # Get messages older than ID 1234 (cursor pagination, preferred for "load more")
PATCH /api/conversation/{message_id}                                         # Edit message: {"content": "..."}
```
The `before_id` parameter enables O(1) keyset pagination — use it instead of high `offset` values for deep pagination. When `before_id` is provided, the API returns messages with `id < before_id`.

### Reset to Message
```bash
POST /api/conversation/{message_id}/reset
```
Deletes all messages after the specified message, along with any documents, audio recordings, and journal entries linked to the deleted messages. S3 files are also removed.

Returns:
```json
{
  "deleted_messages": 5,
  "deleted_documents": 1,
  "deleted_audio": 0,
  "deleted_journal_entries": 2
}
```

---

## Journal

```bash
GET    /api/journal/{session_id}                  # Paginated entries (?limit=&offset=&entry_type=)
GET    /api/journal/{session_id}/date/{date}      # Entries for a specific date (YYYY-MM-DD)
GET    /api/journal/{session_id}/dates             # Dates with entry counts (for calendar)
POST   /api/journal/{session_id}                  # Create entry
PATCH  /api/journal/{entry_id}                    # Update entry
DELETE /api/journal/{entry_id}                    # Delete entry
```

Entry types: `MEDICAL_UPDATE`, `TREATMENT_CHANGE`, `APPOINTMENT`, `INSIGHT`, `MILESTONE`, `OTHER`

---

## Daily Plans (Digests)

```bash
GET  /api/daily-plans/{session_id}              # List all
GET  /api/daily-plans/{session_id}/latest       # Get latest
GET  /api/daily-plans/{session_id}/check        # Check if should generate
POST /api/daily-plans/{session_id}/generate     # Generate (?user_date=YYYY-MM-DD)
PUT  /api/daily-plans/{id}                      # Update: {"user_edited_content": "..."}
PUT  /api/daily-plans/{id}/mark-viewed          # Mark viewed: {"viewed": true}
DELETE /api/daily-plans/{id}                    # Delete
```

---

## Profile

```bash
GET    /api/profile/{session_id}                        # Get profile
GET    /api/profile/{session_id}/check                  # Check if AI update available
POST   /api/profile/{session_id}/update                 # Trigger AI profile update
PUT    /api/profile/{session_id}                        # Manual full profile update
PATCH  /api/profile/{session_id}/section                # Update a single section (see valid sections below)
GET    /api/profile/{session_id}/pending-changes        # Get pending AI-suggested changes
POST   /api/profile/{session_id}/pending-changes/review # Accept/reject pending changes
POST   /api/profile/{session_id}/regenerate             # Regenerate from scratch
DELETE /api/profile/{session_id}                        # Delete profile
GET    /api/profile/{session_id}/export                 # Export as JSON or PDF (PDF carries a disclaimer)
```

`/section` accepts exactly the eight sections the clients edit — `patient` and `preferences`
(objects), and `caregivers`, `providers`, `conditions`, `medications`, `allergies`, `events`
(arrays). An unknown section name or a wrong-typed body is a 400; previously it stored anyway
and broke every subsequent profile read for the session.

---

## Tools

Both tools are **publicly accessible** (no authentication required). When authenticated with a `session_id`, responses are personalized with journal context. Rate limited to 10/minute per IP.

Responses include citations from approved sources: Mayo Clinic, MedlinePlus/NIH, Cleveland Clinic, CDC.

### Jargon Translator
```bash
POST /api/tools/jargon-translator
```
```json
{"medical_term": "tachycardia", "context": "optional context", "session_id": null}
```

### Conversation Coach
```bash
POST /api/tools/conversation-coach
```
```json
{"situation": "Meeting with cardiologist", "session_id": null}
```

---

## Push Notifications (iOS)

Device tokens for APNs push notifications. Only functional when `PUSH_NOTIFICATIONS_ENABLED=True` on the backend.

```bash
POST   /api/notifications/device-token    # Register token
DELETE /api/notifications/device-token    # Unregister on logout
```
```json
{"token": "apns-device-token", "platform": "ios", "app_version": "1.0.0"}
```

Notifications are sent automatically for: new messages in shared sessions, session sharing invitations, and daily digest generation.

---

## Waitlist (when CONTROL_SIGNUPS=TRUE)

Random visitors must join the waitlist and wait for admin approval. However, users invited as collaborators via `/api/sessions/{id}/send-invitation` can register directly using the invitation link.

```bash
GET  /api/waitlist/signup-mode  # Check if waitlist mode active
POST /api/waitlist/join         # Join waitlist: {"email": "...", "captcha_token": "..."}
```

`captcha_token` is optional. iOS clients (with `X-Client-Type: ios` header) skip hCaptcha verification — the existing rate limit provides anti-spam protection. Web clients must provide the token.

---

## Feedback

```bash
POST /api/feedback/submit
```
```json
{
  "name": "John",
  "email": "john@example.com",
  "feedback_type": "bug",
  "message": "...",
  "captcha_token": "hcaptcha_token"
}
```
Types: `bug`, `improvement`, `feature`, `other`. Authentication optional. Rate limited: 3/hour per IP. `captcha_token` is optional — skipped for authenticated users (e.g., iOS); required for unauthenticated web submissions.

---

## Health Check

```bash
GET /api/health             # Simple check for load balancers
GET /api/health/detailed    # Comprehensive (DB, S3, OpenAI, OpenAI Embeddings connectivity) - ADMIN ONLY
```
Simple returns: `{"status": "healthy", "service": "AretaCare API"}`

---

## Admin: Embedding Backfill

Backfills semantic embeddings for existing journal entries. Required after initial deployment to enable semantic retrieval for pre-existing data. Admin-only.

```bash
POST /api/admin/embeddings/backfill
```
Parameters: `batch_size` (1-200, default 50), `session_id` (optional, scope to one session)

Call repeatedly until `remaining` reaches 0.

Response:
```json
{
  "status": "completed",
  "stats": {"total": 50, "embedded": 48, "skipped": 0, "failed": 2, "remaining": 150},
  "message": "Backfill complete. Embedded: 48, Skipped: 0, Failed: 2, Remaining: 150"
}
```

---

## Admin: Email Campaigns

Product-update emails composed in the admin console. Admin-only except where noted.

```bash
GET  /api/admin/email/users                    # All users + engagement metrics (last login, last activity,
                                               # per-feature usage from the last 30 days, content counts,
                                               # unsubscribed flag). Frontend filters/sorts client-side.
POST /api/admin/email/campaigns                # Create + start sending in the background. Returns 202.
GET  /api/admin/email/campaigns                # Campaign history (page, limit)
GET  /api/admin/email/campaigns/{id}           # Status polling. ?include_recipients=true for per-recipient outcomes
POST /api/admin/email/campaigns/{id}/resume    # Resume a campaign stalled by a deploy/restart. Returns 202.
```

Create body: `{"subject": "...", "body_html": "<p>...</p>", "user_ids": ["..."]}`.
The HTML body is sanitized server-side with an allowlist (nh3) before storage and send.
Every selected user must be eligible (active, email verified, not unsubscribed) or the
request 400s with the offending emails. 409 while another campaign is sending.
Rate limited: 20/hour (Admin Email).

Campaign `status`: `pending | sending | stalled | completed | completed_with_errors | failed`
(`stalled` = the sending instance died; resume finishes only pending recipients — sent ones
are never re-emailed).

## Email Preferences & Unsubscribe

```bash
POST /api/email/unsubscribe                    # Public. Body: {"token": "..."} from the emailed link
POST /api/email/unsubscribe/one-click?token=   # Public. RFC 8058 one-click target (List-Unsubscribe-Post)
GET  /api/email/preferences                    # Authenticated. {"product_updates": true|false}
PUT  /api/email/preferences                    # Authenticated. Body: {"product_updates": true|false}
```

Unsubscribing affects only admin product-update emails — transactional email (password
resets, security alerts, invitations) is unaffected. Both unsubscribe endpoints are
idempotent; the token has no expiry. The preferences pair backs the Settings toggle
("Receive product update emails", on by default) and can also opt back in.

---

## Error Handling

Standard HTTP status codes: `200` OK, `201` Created, `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `429` Rate Limited, `500` Server Error

Error format: `{"detail": "Error message"}`

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Login | 6/minute |
| Registration | 3/hour |
| Password Reset | 3/hour |
| MFA Verification | 3/minute |
| File Upload | 10/minute (docs), 10/minute (audio, incl. `/retranscribe`) |
| Presigned URL | 30/minute (document download, thumbnail, audio playback URLs) |
| AI Chat | 30/minute |
| AI Tools | 10/minute (Jargon Translator, Conversation Coach — public) |
| Feedback | 3/hour |
| Waitlist | 5/hour |
| Admin Destructive | 5/hour (delete user, delete session, S3 cleanup) |
| Admin Sensitive | 10/hour (reset password, reset MFA, transfer) |
| Admin Email | 20/hour (invitations, notifications, campaign create/resume) |
| Unsubscribe | 20/minute (public unsubscribe endpoints) |
| General API | 100/minute |

---

## JavaScript Quick Start

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true  // Required for refresh token cookies
});

// Auto-add auth header
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Login (handles MFA)
const login = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  if (res.data.requires_mfa) {
    return { requiresMfa: true, mfaToken: res.data.mfa_token, methods: res.data.mfa_methods };
  }
  localStorage.setItem('auth_token', res.data.access_token);
  return { user: res.data.user };
};

// Upload document (session_id is a query param, not form field)
const uploadDoc = async (file, sessionId) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/documents/upload?session_id=${sessionId}`, formData);
};

// Send message
const sendMessage = async (content, sessionId) => {
  return api.post('/conversation/message', { content, session_id: sessionId });
};
```