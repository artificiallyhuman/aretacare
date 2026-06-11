# Security Policy

## Our Commitment to Security

AretaCare handles sensitive personal health information and we take security seriously. We appreciate the security research community's efforts to responsibly disclose vulnerabilities and will work with researchers to address security issues promptly.

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in AretaCare, please report it privately using one of the following methods:

### Preferred Method: GitHub Security Advisories

1. Navigate to the [Security Advisories](../../security/advisories) page
2. Click "Report a vulnerability"
3. Fill out the form with detailed information about the vulnerability

### Alternative Method: Email

If you prefer email or cannot use GitHub Security Advisories, send your report to:

**security@aretacare.com**

### What to Include in Your Report

To help us understand and address the issue quickly, please include:

- **Description**: A clear description of the vulnerability
- **Impact**: What an attacker could achieve by exploiting this vulnerability
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Proof of Concept**: Code, screenshots, or logs demonstrating the vulnerability
- **Affected Components**: Which parts of the system are affected (frontend, backend, database, etc.)
- **Suggested Fix**: If you have ideas for how to fix the issue (optional)
- **Your Contact Information**: So we can follow up with questions

## What to Expect

### Our Response Timeline

- **Initial Response**: Within 48 hours of receiving your report
- **Vulnerability Assessment**: Within 5 business days, we'll confirm whether the issue is a valid security vulnerability
- **Status Updates**: We'll provide regular updates as we work on a fix
- **Resolution**: We aim to release patches for critical vulnerabilities within 30 days

### Our Commitments

When you report a vulnerability to us, we commit to:

- Acknowledge receipt of your report promptly
- Keep you informed about our progress addressing the issue
- Credit you for the discovery (unless you prefer to remain anonymous)
- Not take legal action against you for responsibly disclosed security research

## Scope

### In Scope

Security vulnerabilities in the following areas are in scope:

- **Authentication & Authorization**: Login bypass, session hijacking, privilege escalation, MFA bypass
- **Data Protection**: SQL injection, NoSQL injection, unauthorized data access
- **Input Validation**: XSS, CSRF, command injection, path traversal
- **API Security**: Authentication issues, rate limiting bypass, data exposure
- **Cryptography**: Weak encryption, insecure key storage
- **Session Management**: Session fixation, weak session tokens
- **File Upload**: Malicious file upload, path traversal
- **Business Logic**: Payment bypass, access control issues
- **Infrastructure**: Server misconfiguration, exposed secrets

### Out of Scope

The following are considered out of scope:

- Vulnerabilities in third-party dependencies (report these to the upstream project)
- Social engineering attacks
- Denial of service attacks
- Phishing attacks
- Physical security issues
- Issues that require physical access to a user's device
- Publicly disclosed vulnerabilities that are already known
- Theoretical vulnerabilities without proof of concept
- Issues in outdated/unsupported browsers

## Security Best Practices for Researchers

When testing for vulnerabilities:

- **Do NOT** access, modify, or delete other users' data
- **Do NOT** perform attacks that could degrade service quality (DoS, DDoS)
- **Do NOT** use automated scanners that generate excessive traffic
- **Do NOT** publicly disclose the vulnerability before we've had time to fix it
- **Do** test only against your own account or test accounts you create
- **Do** make a good faith effort to avoid privacy violations and data destruction
- **Do** contact us immediately if you inadvertently access other users' data

## Disclosure Policy

### Coordinated Disclosure

We follow a **coordinated disclosure** model:

1. You privately report the vulnerability
2. We work together to understand and fix the issue
3. We release a patch and security advisory
4. After the patch is released, you may publicly disclose the vulnerability (we recommend waiting 30 days after patch release)

## Security Features

AretaCare implements comprehensive security measures:

### Authentication & Session Management
- **Two-Token JWT System**: Short-lived access tokens (1 hour) + session-based refresh tokens (7 days max, expires on browser close)
- **HttpOnly Cookies**: Refresh tokens stored in HttpOnly session cookies to prevent XSS access
- **Password Hashing**: bcrypt with secure work factor
- **Password Requirements**: Minimum 8 characters, maximum 72 characters (bcrypt limit)
- **Account Lockout**: 5 failed login attempts triggers 15-minute lockout with progressive warnings
- **MFA Lockout**: 5 failed MFA attempts triggers 15-minute lockout with security alert
- **Account Enumeration Prevention**: Registration returns identical responses for existing and new emails
- **Sign Out Everywhere**: Users can end all active sign-ins
- **Biometric Re-Auth (iOS)**: Opt-in Face ID/Touch ID lock on foreground return after 5 min; passcode fallback; opaque lock screen hides health data

### Multi-Factor Authentication (MFA)
- **Passkeys (WebAuthn)**: Phishing-resistant authentication using biometrics or hardware keys; maximum 10 per account; supported for MFA login on both web (WebAuthn API) and iOS (ASAuthorizationController with Face ID/Touch ID)
- **TOTP (Authenticator Apps)**: 6-digit time-based codes with 30-second rotation; secrets encrypted at rest using Fernet; replay protection prevents code reuse
- **Backup Codes**: 10 one-time-use recovery codes; bcrypt hashed, never stored in plaintext
- **Trusted Devices**: 30-day trust duration with secure HttpOnly cookies; tokens SHA-256 hashed before storage; maximum 10 per user (oldest auto-removed)
- **Sensitive Action Protection**: Password changes, email changes, and account deletion always require MFA re-verification
- **Challenge Expiration**: MFA challenges expire after 5 minutes; action tokens are single-use with 5-minute expiry
- **Rate Limiting**: MFA verification limited to 3 attempts per minute
- **Automatic Cleanup**: Expired challenges and trusted devices cleaned on server startup

### Rate Limiting
- **Proxy-aware client IP**: Forwarded-IP headers are only trusted when the request demonstrably arrives through the CDN edge; otherwise the directly observed peer address is used, so rate limits and security logs can't be evaded with forged headers
- **Login**: 6 attempts per minute per IP
- **Registration**: 3 attempts per hour per IP
- **Password Reset**: 3 requests per hour per IP, plus a per-account limit so a single account can't be flooded with reset emails from many IPs
- **API General**: 100 requests per minute per user
- **File Uploads**: 10 per minute (documents), 5 per minute (audio)
- **Presigned URLs**: 30 per minute (document download, thumbnail, audio playback)
- **AI Tools**: 10 per minute per IP (Jargon Translator, Conversation Coach — publicly accessible)
- **Admin Actions**: 5/hour destructive, 10/hour sensitive, 20/hour email

### Data Protection
- **Encryption in Transit**: TLS/SSL for all connections, HSTS header enforces HTTPS (1-year max-age, preload)
- **SSL Certificate Pinning (iOS)**: SHA-256 SPKI public key pinning on all HTTPS requests including token refresh; Release builds assert if placeholder hashes are detected
- **Encryption at Rest**: S3 server-side encryption (AES-256)
- **Keychain Security (iOS)**: Tokens stored with `.afterFirstUnlockThisDeviceOnly` (prevents Keychain restoration to other devices)
- **SQL Injection Prevention**: SQLAlchemy ORM with parameterized queries
- **XSS Prevention**: ReactMarkdown (web) and MarkdownUI (iOS) for safe content rendering; markdown links restricted to safe URL protocols and opened with `noopener`/`noreferrer`
- **No-cache for API responses**: API responses carry personal data and are marked `Cache-Control: no-store`; the iOS client additionally disables on-disk response caching
- **At-rest protection for temporary files (iOS)**: Downloaded documents, exported profiles, and audio recordings are written with file protection and cleaned up after use
- **App-switcher privacy (iOS)**: A privacy shield hides on-screen content from the app-switcher snapshot whenever the app is not active
- **Input Validation**: Pydantic schemas for all API inputs; iOS validates deep link token format and push-notification payload fields before routing
- **Client-Side File Validation (iOS)**: File size checked against 30MB limit before upload; photo format detected via UTType
- **Care Session Name Validation**: Character restrictions (alphanumeric, spaces, hyphens, underscores, apostrophes only)
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, CSP
- **Device Integrity (iOS)**: Runtime jailbreak detection (suspicious files, sandbox escape, debugger attachment); logs warnings on compromised devices
- **Logout Data Cleanup (iOS)**: All in-memory caches, image cache, and UserDefaults preferences cleared on logout to prevent data leakage on shared devices
- **Build Safety (iOS)**: Release builds crash if `API_BASE_URL` is not configured or if certificate pinning uses placeholder hashes

### Push Notifications (iOS)
- **Feature-gated**: Disabled by default (`PUSH_NOTIFICATIONS_ENABLED=False`); APNs credentials validated at startup
- **Fire-and-forget**: Push sends run in daemon threads and never block API responses
- **Auto-cleanup**: Invalid/expired device tokens automatically removed when APNs reports them
- **Scope**: Notifications for shared care session messages, care session sharing, and daily digests only

### File Upload Security
- **Content-Disposition Headers**: Forces download instead of browser execution
- **File Type Validation**: MIME type and extension checking (iOS uses UTType for photo format detection)
- **File Size Limits**: 30MB documents, 100MB audio — enforced server-side and client-side (iOS validates before upload)
- **Image Validation**: PIL verification for image uploads

### Access Control
- **Care Session Authorization**: Owner and collaborator access validation
- **Admin Role Verification**: Email-based admin list
- **Presigned URLs**: 15-minute default expiration for S3 file access

### Logging & Monitoring
- **Security Event Logging**: Failed logins, invalid tokens, unauthorized access attempts, account lockouts, MFA events (setup, verification, failures)
- **AI-Powered Daily Reports**: Automated analysis of security/error/API logs to detect concerning patterns and generate actionable insights for administrators
- **Audit Logging**: Admin actions tracked with retention policies
- **Error Logging**: Application errors logged for debugging (30-day retention)
- **API Logging**: OpenAI API calls tracked (30-day retention)
- **Email Notifications**: Users notified of security-relevant events (MFA enabled/disabled, new passkey, new trusted device)

### Data Deletion
- **Complete Removal**: Database records + S3 files (documents, thumbnails, audio)
- **Cascading Deletes**: User deletion removes all associated data
- **S3 Orphan Cleanup**: Admin tool to detect and remove orphaned files

For detailed technical implementation, see `docs/SECURITY_IMPLEMENTATION.md`.

## Privacy Considerations

**Important**: AretaCare handles personal health information. When conducting security research:

- Be aware that test accounts may contain sensitive medical information
- Do not share any health information you encounter during testing
- If you accidentally access real user data, notify us immediately and delete any copies

## Questions?

If you have questions about this security policy or responsible disclosure, please contact us at **security@aretacare.com**.

---

**Last Updated**: 2026-02-12
