# Feedback System

User feedback collection with hCaptcha spam prevention and email notifications.

## Features

- **Contact page** (`/contact`) with auto-populated user info
- **Desktop**: Floating tab on right side of screen
- **Mobile**: "Send Feedback" link in menu
- **Types**: Bug report, improvement, feature request, other
- **Security**: hCaptcha, rate limiting (3/hour), input sanitization

## Configuration

### 1. Get hCaptcha Keys
Sign up at https://www.hcaptcha.com/ and create a site.

### 2. Environment Variables

**Backend** (`backend/.env`):
```bash
HCAPTCHA_SECRET_KEY=your_secret_key
FEEDBACK_EMAIL=feedback@yourdomain.com
```

**Frontend** (`frontend/.env`):
```bash
VITE_HCAPTCHA_SITE_KEY=your_site_key
```

**Development mode**: Uses test keys if not configured. Backend skips verification if `HCAPTCHA_SECRET_KEY` not set.

### 3. Email Setup
Uses existing SMTP configuration. Ensure `SMTP_*` variables are set in `backend/.env`. See [EMAIL_SETUP.md](EMAIL_SETUP.md).

## API

```bash
POST /api/feedback/submit
Authorization: Bearer <token>
```
```json
{
  "name": "John",
  "email": "john@example.com",
  "feedback_type": "bug",
  "message": "Description...",
  "captcha_token": "hcaptcha_token",
  "user_agent": "optional",
  "page_url": "/conversation"
}
```

Rate limit: 3/hour per IP

## File Structure

**Backend**: `api/feedback.py`, `schemas/feedback.py`, `services/email_service.py`, `core/rate_limit.py`

**Frontend**: `pages/Contact.jsx`, `components/FeedbackTab.jsx`, `components/Header.jsx` (mobile menu)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| hCaptcha not loading | Check `VITE_HCAPTCHA_SITE_KEY` in frontend env |
| Emails not sending | Verify `SMTP_PASSWORD` and check backend logs |
| Rate limited | Default 3/hour; adjust in `backend/app/core/rate_limit.py` |
| Tab not showing | Verify logged in; hidden on `/contact` and admin pages |

## Customization

- **Email templates**: `backend/app/services/email_service.py` (`send_feedback_to_team()`, `send_feedback_confirmation()`)
- **Form styling**: `frontend/src/pages/Contact.jsx`
- **Feedback types**: `backend/app/schemas/feedback.py` (FeedbackType enum)
