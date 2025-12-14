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

- **Authentication & Authorization**: Login bypass, session hijacking, privilege escalation
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

AretaCare implements several security measures:

- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Password Requirements**: Minimum 8 characters, maximum 72 characters
- **Data Encryption**: TLS/SSL for data in transit
- **Input Validation**: Parameterized queries to prevent SQL injection
- **Session Management**: Secure session tokens with 7-day expiration
- **Access Control**: Role-based permissions for all API endpoints
- **Audit Logging**: Security events logged for admin review
- **Data Deletion**: Complete data removal (database + S3 files) on account deletion

## Privacy Considerations

**Important**: AretaCare handles personal health information. When conducting security research:

- Be aware that test accounts may contain sensitive medical information
- Do not share any health information you encounter during testing
- If you accidentally access real user data, notify us immediately and delete any copies

## Questions?

If you have questions about this security policy or responsible disclosure, please contact us at **security@aretacare.com**.

---

**Last Updated**: 2025-12-04
