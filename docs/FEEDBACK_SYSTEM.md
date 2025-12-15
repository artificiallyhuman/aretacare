# Feedback System Documentation

## Overview

This application includes a comprehensive user feedback system that allows users to submit bug reports, suggest improvements, request new features, or provide general feedback. The system includes:

1. **Contact/Feedback Page** (`/contact`) - Full form with auto-populated user information
2. **Floating Feedback Tab** - Visible on all pages (except `/contact`) for easy access
3. **hCaptcha Integration** - Spam prevention
4. **Email Notifications** - Both to the team and user confirmation
5. **Security Features** - Rate limiting, input sanitization, XSS prevention
6. **Mobile-Responsive** - Works seamlessly on all devices

## Features

### 1. Contact Page (`/contact`)
- **Header & Description** - Clear instructions for users
- **Auto-populated Fields** - Name and email pre-filled from user account
- **Feedback Type Dropdown** - Four options:
  - Bug Report - Something isn't working correctly
  - Suggested Improvement - How to make it better
  - New Feature Request - Something you'd like to see
  - Other - General feedback or questions
- **Message Textarea** - 10-5000 character limit with counter
- **hCaptcha Verification** - Prevents spam submissions
- **Submit/Cancel Buttons** - Mobile-responsive layout
- **Success Screen** - Confirmation with auto-redirect after 3 seconds
- **Privacy Notice** - Transparent about data collection

### 2. Floating Feedback Tab
- **Fixed Position** - Right side of screen at middle height
- **Visible on All Pages** - Except `/contact` page itself
- **Hover Animation** - Expands slightly on hover
- **Click Action** - Navigates to `/contact` page with return URL saved
- **Mobile-Friendly** - Touch-optimized with tooltip

### 3. Backend API (`/api/feedback/submit`)
- **Authentication Required** - Must be logged in
- **Rate Limited** - 3 submissions per hour per IP
- **hCaptcha Verification** - Server-side validation
- **Input Sanitization** - XSS prevention, HTML escaping
- **Diagnostic Metadata** - Captures user agent, page URL, client IP
- **Dual Email Notifications**:
  - To your team email address (configurable) with full details
  - To user as confirmation with copy of their submission

### 4. Security Features
- **Rate Limiting** - 3 submissions/hour per IP (configurable in `backend/app/core/rate_limit.py`)
- **Input Sanitization** - All user input is HTML-escaped and stripped of tags
- **Length Validation** - Name (1-255 chars), Message (10-5000 chars)
- **hCaptcha Verification** - Both frontend and backend validation
- **Privacy-Conscious Metadata** - Only essential diagnostic info collected

## Configuration

### Step 1: Install Frontend Dependencies

```bash
cd frontend
npm install
```

This will install `@hcaptcha/react-hcaptcha@^1.10.1`.

### Step 2: Configure hCaptcha

#### Get hCaptcha Keys
1. Sign up at [https://www.hcaptcha.com/](https://www.hcaptcha.com/)
2. Create a new site
3. Note your **Site Key** and **Secret Key**

#### Backend Configuration
Add to `backend/.env`:
```bash
# hCaptcha
HCAPTCHA_SECRET_KEY=your_secret_key_here

# Feedback Email (where feedback submissions will be sent)
FEEDBACK_EMAIL=feedback@yourdomain.com
```

#### Frontend Configuration
Add to `frontend/.env`:
```bash
VITE_HCAPTCHA_SITE_KEY=your_site_key_here
```

**Development Mode**: The code uses a test key (`10000000-ffff-ffff-ffff-000000000001`) if no site key is configured. The backend will skip verification if `HCAPTCHA_SECRET_KEY` is not set.

### Step 3: Email Configuration

The feedback system uses the existing SMTP configuration. Ensure these are set in `backend/.env`:

```bash
SMTP_HOST=smtp.gmail.com                    # Your SMTP server
SMTP_PORT=587                                # SMTP port (typically 587 for TLS)
SMTP_USER=noreply@yourdomain.com            # Your SMTP username
SMTP_PASSWORD=your_smtp_password_here       # Your SMTP password or app-specific password
SMTP_FROM_EMAIL=noreply@yourdomain.com      # Email address that sends notifications
SMTP_FROM_NAME=Your App Name                # Sender name shown in emails
FRONTEND_URL=http://localhost:3001          # Your application URL (for email links)
FEEDBACK_EMAIL=feedback@yourdomain.com      # Email address to receive feedback submissions
```

**Note**: If using Gmail, you'll need to create an [App Password](https://support.google.com/accounts/answer/185833) for `SMTP_PASSWORD`.

### Step 4: Restart Services

```bash
docker compose restart backend
docker compose restart frontend
```

Or rebuild if needed:
```bash
docker compose down
docker compose up --build
```

## Testing

### Manual Testing Checklist

#### Desktop Testing
- [ ] Navigate to any page, verify feedback tab is visible on right side
- [ ] Click feedback tab, verify navigation to `/contact` page
- [ ] Verify name and email are auto-populated
- [ ] Select each feedback type option
- [ ] Type a message (test character counter)
- [ ] Complete hCaptcha
- [ ] Submit form
- [ ] Verify success screen shows
- [ ] Verify auto-redirect after 3 seconds
- [ ] Check email for confirmation message

#### Mobile Testing
- [ ] Verify feedback tab is visible and touch-friendly
- [ ] Tap feedback tab, verify navigation works
- [ ] Verify form is mobile-responsive
- [ ] Test submit/cancel buttons layout
- [ ] Complete and submit form on mobile
- [ ] Verify success screen is mobile-friendly

#### Security Testing
- [ ] Submit 4 forms rapidly, verify 4th is rate-limited
- [ ] Try submitting without captcha, verify error
- [ ] Try submitting with HTML in message, verify it's sanitized
- [ ] Try very long message (>5000 chars), verify validation
- [ ] Try empty message, verify validation

#### Email Testing
- [ ] Submit feedback, verify team receives email at your configured FEEDBACK_EMAIL
- [ ] Verify team email includes user info and diagnostic metadata
- [ ] Verify user receives confirmation email
- [ ] Verify confirmation email includes copy of their feedback
- [ ] Check spam folders if emails don't arrive

## File Structure

### Backend
```
backend/app/
├── api/
│   └── feedback.py              # Feedback API endpoint
├── schemas/
│   └── feedback.py              # Pydantic schemas
├── services/
│   └── email_service.py         # Email methods (lines 1460-1762)
├── core/
│   ├── config.py                # hCaptcha & feedback email config
│   └── rate_limit.py            # Rate limiting config
```

### Frontend
```
frontend/src/
├── pages/
│   └── Contact.jsx              # Contact/feedback page
├── components/
│   └── FeedbackTab.jsx          # Floating feedback tab
├── services/
│   └── api.js                   # feedbackAPI (lines 272-275)
└── App.jsx                      # Route & FeedbackTab integration
```

## API Reference

### POST `/api/feedback/submit`

**Authentication**: Required (JWT Bearer token)

**Rate Limit**: 3 requests per hour per IP

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "feedback_type": "bug",  // "bug" | "improvement" | "feature" | "other"
  "message": "Detailed feedback message...",
  "captcha_token": "hcaptcha_response_token",
  "user_agent": "Mozilla/5.0...",  // Optional
  "page_url": "/conversation"       // Optional
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Thank you for your feedback! We've received your submission and will review it shortly."
}
```

**Error Responses**:
- `400` - Validation error (missing fields, invalid captcha, invalid feedback type)
- `401` - Authentication required
- `429` - Rate limit exceeded
- `500` - Server error

## Email Templates

### Team Notification Email
- **To**: Value of `FEEDBACK_EMAIL` environment variable
- **Reply-To**: User's email address
- **Subject**: `[Feedback Type] Feedback from [User Name]`
- **Content**: User info, message, diagnostic metadata
- **Format**: HTML + plain text

### User Confirmation Email
- **To**: User's email address
- **From**: Value of `SMTP_FROM_EMAIL` environment variable
- **Subject**: `Thank You for Your Feedback - [App Name]`
- **Content**: Thank you message, copy of their feedback
- **Format**: HTML + plain text

**Customization**: To customize email templates, edit the methods in `backend/app/services/email_service.py`:
- `send_feedback_to_team()` - Team notification email
- `send_feedback_confirmation()` - User confirmation email

## Troubleshooting

### hCaptcha Not Loading
- Check `VITE_HCAPTCHA_SITE_KEY` is set in frontend environment
- Verify site key is correct for your domain
- Check browser console for errors
- Try the test key in development: `10000000-ffff-ffff-ffff-000000000001`

### Emails Not Sending
- Check `SMTP_PASSWORD` is configured in backend
- Verify Gmail App Password if using Gmail
- Check backend logs for SMTP errors
- Verify `FEEDBACK_EMAIL` is set correctly

### Rate Limiting Issues
- Default: 3 submissions per hour per IP
- Adjust in `backend/app/core/rate_limit.py`: `FEEDBACK_SUBMIT = "3/hour"`
- Can change to `"5/hour"`, `"10/minute"`, etc.

### Form Not Auto-Populating
- Verify user is logged in
- Check `useSessionContext()` is working
- Open browser console, check for React errors

### Feedback Tab Not Showing
- Verify user is logged in (only shows for authenticated users)
- Check page is not `/contact` (hidden on that page)
- Verify `FeedbackTab` is imported in `App.jsx`
- Check for CSS conflicts (z-index: 40)

## Privacy & Security

### Data Collected
The feedback system collects:
1. **User Information**: Name, email (from authenticated account)
2. **Feedback Content**: Type and message
3. **Diagnostic Metadata**:
   - User agent (browser information)
   - Page URL (where feedback was initiated)
   - Client IP address (for spam prevention)
   - User ID (for troubleshooting)

### Data Protection
- All input is sanitized to prevent XSS
- Rate limiting prevents abuse
- hCaptcha prevents automated spam
- Email sent only to configured addresses
- No third-party tracking or analytics

### GDPR Compliance Notes
- Users are informed via privacy notice on form
- Data is used solely for product improvement
- Minimal data collection approach
- User email confirmation provides transparency

## Future Enhancements

Potential improvements to consider:
1. **Feedback Dashboard** - Admin page to view all feedback submissions
2. **Status Tracking** - Let users see status of their feedback
3. **Attachment Support** - Allow screenshots or files
4. **Response System** - Reply to users directly
5. **Categorization** - Auto-tag feedback topics
6. **Analytics** - Track common issues and requests
7. **Integration** - Connect to issue tracking (GitHub, Jira, etc.)
8. **User Notifications** - Email when feedback is resolved

## 🎨 Customization

### Email Templates
Customize the HTML/text in `backend/app/services/email_service.py`:
- `send_feedback_to_team()` - Team notification email (lines 1460-1614)
- `send_feedback_confirmation()` - User confirmation email (lines 1616-1762)
- Update branding, colors, and copy to match your application

### Frontend Styling
Update in `frontend/src/pages/Contact.jsx`:
- Page title and description
- Privacy notice text
- Success message text
- Form field labels and placeholders

### Feedback Categories
Modify dropdown options to match your needs:
- Backend enum: `backend/app/schemas/feedback.py` - `FeedbackType`
- Frontend options: `frontend/src/pages/Contact.jsx` - `<select>` element
- Current categories: bug, improvement, feature, other

## Support

For issues or questions about the feedback system:
- Check backend logs: `docker compose logs -f backend`
- Check frontend console in browser DevTools
- Review error logs in admin console: `/admin/error-logs`
- Verify environment configuration
- Test with development/test keys first
