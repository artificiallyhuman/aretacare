# Email Notification Setup

This guide explains how to configure email notifications for AretaCare using Gmail SMTP.

## Email Notification Types

AretaCare sends automated emails for:

**Account & Verification:**
- **Registration verification** — Verification link on signup
- **Email change verification** — Verification link to new address
- **Email change notification** — Security notice to old address
- **Password reset** — Reset link when requested
- **Password changed** — Security notification after update

**Collaboration:**
- **Collaborator added (to owner)** — Notification to care session owner
- **Collaborator invitation (existing user)** — Notification when added as a collaborator
- **Collaborator invitation (new user)** — Registration link for non-members (bypasses waitlist)
- **Invitation accepted** — Notification to owner when invitee registers and verifies
- **Collaborator removed** — Notification when removed from a care session
- **Ownership transferred** — Notifications to both old and new owner

**MFA & Security:**
- **MFA enabled/disabled** — Confirmation emails
- **New passkey added** — Security notification
- **New trusted device** — Security notification
- **MFA reset by admin** — Notification that MFA was removed
- **Security alerts** — Critical event notifications to security team (rate-limited to 10/hour)

**Admin & Waitlist:**
- **Waitlist invitation** — Approval email with registration link
- **Waitlist user registered** — Admin notification
- **Inactive account notification** — Re-engagement emails
- **Product update campaigns** — Admin-composed emails to selected users (see below)

**Feedback:**
- **Feedback to team** — Forwards user feedback to team
- **Feedback confirmation** — Acknowledgment to user

## Admin Campaign Emails & Unsubscribe

The admin console's "Email Users" panel sends product-update emails to selected users.
These are the only emails with an unsubscribe mechanism — **unsubscribing never affects
transactional email** (verification, password reset, security, collaboration).

- Every campaign email auto-appends a footer with a **per-user unsubscribe link**
  (`{FRONTEND_URL}/unsubscribe?token=...`; tokens are 256-bit, per-user, no expiry).
- **Postal address**: when `COMPANY_POSTAL_ADDRESS` is set, the footer includes it; when
  empty (the default), the line is omitted entirely. CAN-SPAM expects commercial email to
  carry a valid postal address, but per FTC guidance a **USPS PO box or a registered
  commercial mailbox (UPS Store / virtual mailbox)** satisfies it — no home or street
  address needed. Updates to existing account holders lean toward exempt "relationship"
  content, but promotional-toned campaigns can count as commercial, so a PO box is the
  safe long-term answer.
- A `List-Unsubscribe` header is always set. When `API_PUBLIC_URL` is configured (e.g.
  `https://api.aretacare.com`), the RFC 8058 `List-Unsubscribe-Post` one-click header is
  added too, so mail providers can offer native one-click unsubscribe. It must point at the
  API — the static frontend can't process the provider's POST — hence the separate env var.
- Users can also opt out (or back in) via the Settings toggle "Receive updates"
  (on by default; web and iOS). Either path sets the same flag; unsubscribed users
  remain visible in the admin recipient list but cannot be selected.
- **Dev mode** (no `SMTP_PASSWORD`): campaign recipients are recorded as
  `skipped (smtp_not_configured)` and each unsubscribe URL is logged, so the flow is
  testable end-to-end from `docker compose logs -f backend`.
- Sending runs as a background job (Cloudflare would 524 a long synchronous send); progress
  is polled by the admin UI, and a campaign interrupted by a deploy shows as `stalled` with
  a Resume action that never re-emails already-sent recipients.
- **Deliverability note**: campaigns share `SMTP_FROM_EMAIL` with transactional mail. Fine at
  waitlist scale; if volume grows, consider a separate From address or an ESP so a
  spam-flagged campaign can't drag down transactional deliverability.

## Gmail App Password Setup

**IMPORTANT:** You cannot use your regular Gmail password for SMTP. You must create an App Password.

### Prerequisites

1. You must have 2-Step Verification enabled on your Google Account
2. You need access to a Gmail account you want to use for sending emails (e.g., `notification@yourdomain.com`)

### Steps to Create Gmail App Password

1. **Go to Google Account Settings**
   - Visit: https://myaccount.google.com/
   - Sign in with your Gmail account

2. **Navigate to Security**
   - Click "Security" in the left sidebar
   - Ensure "2-Step Verification" is ON (required for App Passwords)

3. **Create App Password**
   - Scroll down to "How you sign in to Google"
   - Click "2-Step Verification"
   - Scroll to bottom and click "App passwords"
   - You may need to verify your identity again

4. **Generate Password**
   - Select app: "Mail"
   - Select device: "Other (Custom name)"
   - Enter: "AretaCare Backend"
   - Click "Generate"
   - Google will display a 16-character password (e.g., `abcd efgh ijkl mnop`)

5. **Copy the App Password**
   - Copy the 16-character password (without spaces)
   - **IMPORTANT:** You won't be able to see this password again

6. **Add to Environment File**
   - Open `backend/.env`
   - Set `SMTP_PASSWORD=abcdefghijklmnop` (the 16-character password without spaces)
   - Example:
     ```
     SMTP_PASSWORD=abcdefghijklmnop
     ```

7. **Restart Backend**
   ```bash
   docker compose restart backend
   ```

## Configuration Variables

The following variables are configured in `backend/.env`:

```bash
# Email Configuration
SMTP_HOST=smtp.gmail.com          # Gmail SMTP server
SMTP_PORT=587                      # TLS port
SMTP_USER=your-email@gmail.com    # Your Gmail account
SMTP_PASSWORD=                     # 16-character App Password (SET THIS!)
SMTP_FROM_EMAIL=your-email@gmail.com  # Email address shown to recipients
SMTP_FROM_NAME=YourAppName         # Name shown to recipients
FRONTEND_URL=http://localhost:3001  # Used for reset link
```

## Testing Email Notifications

### Development Mode (No Email Configured)

If `SMTP_PASSWORD` is not set:
- Password reset tokens are still generated and stored in the database
- The reset link is logged to the backend console/logs (check Docker logs)
- No actual emails are sent for any notification type
- The API returns success messages but no emails are delivered

**To test password reset in development mode:**
1. Check backend logs for the reset URL:
   ```bash
   docker compose logs backend --tail 50
   ```
2. Look for: `Development mode: Password reset link: http://localhost:3001/password-reset?token=...`
3. Copy the URL from logs and paste into your browser

### Production Mode (Email Configured)

Once `SMTP_PASSWORD` is set:
- All email notifications are sent via Gmail SMTP
- Users receive professional HTML emails for all notification types
- Password reset links expire in 1 hour
- Tokens are never exposed to the client

### Testing Different Email Types

1. **Password Reset**
   - Go to: http://localhost:3001/login → "Forgot password?"
   - Check email inbox for reset link

2. **Password Changed**
   - Go to Settings → Change password
   - Check email inbox for security notification

3. **Email Changed**
   - Go to Settings → Change email
   - Check OLD email inbox for change notification

4. **Collaborator Notifications**
   - Share a care session with another user
   - Both owner and collaborator receive email notifications

## Email Templates

All emails include:

- **Professional HTML design** with AretaCare branding
- **Clear action buttons** where applicable
- **Plain text fallback** for compatibility
- **Security notices** with instructions for unauthorized changes
- **Responsive design** that works on all devices

## Troubleshooting

### "SMTP Authentication failed"

**Problem:** Backend logs show SMTP authentication error

**Solutions:**
1. Verify 2-Step Verification is enabled on your Gmail account
2. Regenerate the App Password following the steps above
3. Make sure you're using the App Password, NOT the Gmail password
4. Ensure there are no spaces in the SMTP_PASSWORD value
5. Verify SMTP_USER matches your Gmail account

### "Email not sent" in logs

**Problem:** Backend logs show "SMTP_PASSWORD not configured. Email not sent. Using development mode."

**Solution:** This means `SMTP_PASSWORD` is empty. Set the App Password in `.env` and restart backend. All email notifications will be suppressed until configured.

### Password reset token expired

**Problem:** User sees "Invalid or expired reset token"

**Explanation:** Reset tokens expire after 1 hour for security.

**Solution:** Request a new password reset link.

### Email not received

**Possible causes:**
1. Check spam/junk folder
2. Verify the email address is correct
3. Check backend logs for SMTP errors
4. Verify Gmail account hasn't hit sending limits (rare)

## Security Notes

1. **App Passwords are sensitive** - Treat like regular passwords
2. **Never commit** App Passwords to version control
3. **Token expiration** - Reset links expire in 1 hour
4. **One-time use** - Each token can only be used once
5. **No user enumeration** - API doesn't reveal if email exists
6. **Tokens never exposed to client** - Reset tokens only appear in emails or server logs (never in API responses)
7. **Server-side logging only** - In development mode, reset URLs only appear in backend Docker logs

## Production Deployment

For production on Render.com or other platforms:

1. Add environment variable `SMTP_PASSWORD` with the App Password
2. Update `FRONTEND_URL` to your production domain
3. Ensure all other SMTP_* variables are set correctly
4. Test password reset on production before going live

## Alternative Email Providers

While this setup uses Gmail, you can configure other providers:

**SendGrid:**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your_sendgrid_api_key
```

**Mailgun:**
```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@yourdomain.mailgun.org
SMTP_PASSWORD=your_mailgun_password
```

**AWS SES:**
```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your_ses_smtp_username
SMTP_PASSWORD=your_ses_smtp_password
```
