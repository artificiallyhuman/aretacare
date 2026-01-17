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
- **Sign Out Everywhere**: Users can end all active sign-ins

### Multi-Factor Authentication (MFA)
- **Passkeys (WebAuthn)**: Phishing-resistant authentication using biometrics or hardware keys; maximum 10 per account
- **TOTP (Authenticator Apps)**: 6-digit time-based codes with 30-second rotation; secrets encrypted at rest using Fernet; replay protection prevents code reuse
- **Backup Codes**: 10 one-time-use recovery codes; bcrypt hashed, never stored in plaintext
- **Trusted Devices**: 30-day trust duration with secure HttpOnly cookies; tokens SHA-256 hashed before storage; maximum 10 per user (oldest auto-removed)
- **Sensitive Action Protection**: Password changes, email changes, and account deletion always require MFA re-verification
- **Challenge Expiration**: MFA challenges expire after 5 minutes; action tokens are single-use with 5-minute expiry
- **Rate Limiting**: MFA verification limited to 5 attempts per minute
- **Automatic Cleanup**: Expired challenges and trusted devices cleaned on server startup

### Rate Limiting
- **Login**: 6 attempts per minute per IP
- **Registration**: 3 attempts per hour per IP
- **Password Reset**: 3 requests per hour
- **API General**: 100 requests per minute per user
- **File Uploads**: 10 per minute (documents), 5 per minute (audio)

### Data Protection
- **Encryption in Transit**: TLS/SSL for all connections, HSTS header enforces HTTPS (1-year max-age)
- **Encryption at Rest**: S3 server-side encryption (AES-256)
- **SQL Injection Prevention**: SQLAlchemy ORM with parameterized queries
- **XSS Prevention**: ReactMarkdown for safe content rendering
- **Input Validation**: Pydantic schemas for all API requests
- **Session Name Validation**: Character restrictions (alphanumeric, spaces, hyphens, underscores, apostrophes only)
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, CSP

### File Upload Security
- **Content-Disposition Headers**: Forces download instead of browser execution
- **File Type Validation**: MIME type and extension checking
- **File Size Limits**: 30MB documents, 100MB audio (OpenAI file URL limit is 32MB; audio is transcribed first)
- **Image Validation**: PIL verification for image uploads

### Access Control
- **Session-Based Authorization**: Owner and collaborator access validation
- **Admin Role Verification**: Email-based admin list
- **Presigned URLs**: 24-hour expiration for S3 file access

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

**Last Updated**: 2026-01-06
