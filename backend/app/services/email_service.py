import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import make_msgid, formatdate
from typing import Optional
from app.core.config import settings
import logging
import time

logger = logging.getLogger(__name__)

# Email retry configuration
EMAIL_MAX_RETRIES = 3
EMAIL_RETRY_DELAY = 1  # Initial delay in seconds
EMAIL_MAX_RETRY_DELAY = 8  # Max delay between retries
EMAIL_SMTP_TIMEOUT = 30  # SMTP connection timeout in seconds

# Retryable SMTP exceptions (transient failures)
RETRYABLE_SMTP_EXCEPTIONS = (
    smtplib.SMTPServerDisconnected,
    smtplib.SMTPConnectError,
    smtplib.SMTPHeloError,
    smtplib.SMTPDataError,
    TimeoutError,
    ConnectionError,
    OSError,
)


class EmailService:
    """Service for sending emails via SMTP with retry support"""

    @staticmethod
    def _send_with_retry(message: MIMEMultipart) -> bool:
        """
        Send email with exponential backoff retry for transient failures.

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        last_exception = None

        for attempt in range(EMAIL_MAX_RETRIES):
            try:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=EMAIL_SMTP_TIMEOUT) as server:
                    server.starttls()
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.send_message(message)
                return True

            except RETRYABLE_SMTP_EXCEPTIONS as e:
                last_exception = e
                retry_delay = min(
                    EMAIL_RETRY_DELAY * (2 ** attempt),
                    EMAIL_MAX_RETRY_DELAY
                )

                if attempt < EMAIL_MAX_RETRIES - 1:
                    logger.warning(
                        f"SMTP transient error (attempt {attempt + 1}/{EMAIL_MAX_RETRIES}): {type(e).__name__}. "
                        f"Retrying in {retry_delay}s..."
                    )
                    time.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"SMTP failed after {EMAIL_MAX_RETRIES} attempts: {last_exception}")
                    return False

            except smtplib.SMTPAuthenticationError as e:
                logger.error(f"SMTP Authentication failed: {str(e)}")
                return False

            except smtplib.SMTPRecipientsRefused as e:
                logger.error(f"SMTP recipients refused: {str(e)}")
                return False

            except smtplib.SMTPException as e:
                logger.error(f"SMTP error sending email: {str(e)}")
                return False

            except Exception as e:
                logger.error(f"Unexpected error sending email: {str(e)}")
                return False

        return False

    @staticmethod
    def _add_deliverability_headers(message: MIMEMultipart) -> None:
        """
        Add headers that improve email deliverability and reduce spam scoring.

        These headers help email providers verify the message is legitimate:
        - Message-ID: Unique identifier for the message
        - Date: RFC 2822 formatted timestamp
        - Reply-To: Set to sender address (override in specific methods if needed)
        - X-Mailer: Identifies the sending application
        - X-Priority: Normal priority (not spam-like high priority)
        """
        # Extract domain from sender email for Message-ID
        domain = settings.SMTP_FROM_EMAIL.split('@')[1] if '@' in settings.SMTP_FROM_EMAIL else 'aretacare.com'

        message["Message-ID"] = make_msgid(domain=domain)
        message["Date"] = formatdate(localtime=True)
        message["Reply-To"] = settings.SMTP_FROM_EMAIL  # Explicit sender for deliverability
        message["X-Mailer"] = "AretaCare Notifications"
        message["X-Priority"] = "3"  # Normal priority

    @staticmethod
    def send_password_reset_email(to_email: str, reset_token: str) -> bool:
        """
        Send password reset email with reset link

        Args:
            to_email: Recipient email address
            reset_token: Password reset token

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build reset URL
            reset_url = f"{settings.FRONTEND_URL}/password-reset?token={reset_token}"

            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = "Password Reset - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello,

You recently requested to reset your password for your AretaCare account. Click the link below to reset it:

{reset_url}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email or contact us at support@aretacare.com if you have concerns.

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Password Reset Request</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You recently requested to reset your password for your AretaCare account. Click the button below to reset it:
                            </p>

                            <!-- Button -->
                            <table role="presentation" style="margin: 32px 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{reset_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="{reset_url}" style="color: #059669; text-decoration: none; word-break: break-all;">{reset_url}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> This link will expire in 1 hour.
                                </p>
                            </div>

                            <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                If you did not request a password reset, please ignore this email or <a href="mailto:support@aretacare.com" style="color: #059669; text-decoration: underline;">contact us</a> if you have concerns.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                logger.info(f"Development mode: Password reset link: {reset_url}")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Password reset email sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Unexpected error preparing email: {str(e)}")
            return False

    @staticmethod
    def send_password_changed_email(to_email: str, user_name: str) -> bool:
        """
        Send notification email when password is changed

        Args:
            to_email: Recipient email address
            user_name: Name of the user

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = "Password Changed - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {user_name},

Your AretaCare account password was recently changed.

If you made this change, no further action is needed.

If you did NOT make this change, please contact AretaCare security immediately at security@aretacare.com to secure your account.

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Password Changed</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Your AretaCare account password was recently changed.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                If you made this change, no further action is needed.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare security immediately at <a href="mailto:security@aretacare.com" style="color: #92400e; text-decoration: underline;">security@aretacare.com</a> to secure your account.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Password changed notification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing password changed email: {str(e)}")
            return False

    @staticmethod
    def send_email_changed_notification(old_email: str, new_email: str, user_name: str) -> bool:
        """
        Send notification to old email address when email is changed

        Args:
            old_email: Previous email address (recipient)
            new_email: New email address
            user_name: Name of the user

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = "Email Address Changed - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = old_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {user_name},

Your AretaCare account email address was recently changed from {old_email} to {new_email}.

If you made this change, no further action is needed.

If you did NOT make this change, please contact AretaCare security immediately at security@aretacare.com to secure your account.

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Email Address Changed</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Your AretaCare account email address was recently changed from <strong>{old_email}</strong> to <strong>{new_email}</strong>.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                If you made this change, no further action is needed.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare security immediately at <a href="mailto:security@aretacare.com" style="color: #92400e; text-decoration: underline;">security@aretacare.com</a> to secure your account.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Email changed notification sent successfully to {old_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing email changed notification: {str(e)}")
            return False

    @staticmethod
    def send_email_change_verification(to_email: str, user_name: str, verification_token: str) -> bool:
        """
        Send verification email to new email address before changing

        Args:
            to_email: New email address (recipient)
            user_name: Name of the user
            verification_token: Token to verify the email change

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build verification URL
            verify_url = f"{settings.FRONTEND_URL}/verify-email-change?token={verification_token}"

            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = "Verify Your New Email Address - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {user_name},

You recently requested to change your AretaCare account email address to this email. Click the link below to verify this email address:

{verify_url}

This link will expire in 1 hour.

If you did not request this change, please ignore this email. Your email address will not be changed.

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Verify Your New Email Address</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You recently requested to change your AretaCare account email address to this email. Click the button below to verify:
                            </p>

                            <!-- Button -->
                            <table role="presentation" style="margin: 32px 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{verify_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Verify Email Address
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="{verify_url}" style="color: #059669; text-decoration: none; word-break: break-all;">{verify_url}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> This link will expire in 1 hour.
                                </p>
                            </div>

                            <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                If you did not request this change, please ignore this email. Your email address will not be changed.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                logger.info(f"Development mode: Email verification link: {verify_url}")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Email change verification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing email change verification: {str(e)}")
            return False

    @staticmethod
    def send_registration_verification(to_email: str, user_name: str, verification_token: str) -> bool:
        """
        Send verification email to new user after registration

        Args:
            to_email: User's email address
            user_name: Name of the user
            verification_token: Token to verify the email

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build verification URL
            verify_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"

            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = "Verify Your Email - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {user_name},

Welcome to AretaCare! Please verify your email address to complete your registration.

Click the link below to verify your email:

{verify_url}

This link will expire in 1 hour.

If you did not create an AretaCare account, please ignore this email.

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Welcome to AretaCare!</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Thank you for signing up. Please verify your email address to complete your registration and start using AretaCare.
                            </p>

                            <!-- Button -->
                            <table role="presentation" style="margin: 32px 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{verify_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Verify Email Address
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="{verify_url}" style="color: #059669; text-decoration: none; word-break: break-all;">{verify_url}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> This link will expire in 1 hour.
                                </p>
                            </div>

                            <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                If you did not create an AretaCare account, please ignore this email.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                logger.info(f"Development mode: Email verification link: {verify_url}")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Registration verification email sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing registration verification email: {str(e)}")
            return False

    @staticmethod
    def send_collaborator_added_to_owner_email(
        owner_email: str,
        owner_name: str,
        session_name: str,
        collaborator_name: str,
        collaborator_email: str
    ) -> bool:
        """
        Send notification to session owner when a collaborator is added

        Args:
            owner_email: Session owner's email address
            owner_name: Session owner's name
            session_name: Name of the session
            collaborator_name: Name of the collaborator added
            collaborator_email: Email of the collaborator added

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = f"Collaborator Added to {session_name} - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = owner_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {owner_name},

A collaborator was recently added to your AretaCare session "{session_name}".

Collaborator Details:
- Name: {collaborator_name}
- Email: {collaborator_email}

This collaborator now has full access to the session data.

If you made this change, no further action is needed.

If you did NOT add this collaborator, please contact AretaCare support immediately at support@aretacare.com.

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Collaborator Added</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {owner_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                A collaborator was recently added to your AretaCare session <strong>"{session_name}"</strong>.
                            </p>

                            <!-- Collaborator Details -->
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 4px; margin: 24px 0;">
                                <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-weight: 600;">Collaborator Details:</p>
                                <p style="margin: 4px 0; color: #374151; font-size: 14px;">
                                    <strong>Name:</strong> {collaborator_name}
                                </p>
                                <p style="margin: 4px 0; color: #374151; font-size: 14px;">
                                    <strong>Email:</strong> {collaborator_email}
                                </p>
                            </div>

                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                This collaborator now has full access to the session data.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                If you made this change, no further action is needed.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> If you did NOT add this collaborator, please contact AretaCare support immediately at <a href="mailto:support@aretacare.com" style="color: #92400e; text-decoration: underline;">support@aretacare.com</a>.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Collaborator added notification sent to owner {owner_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing collaborator added to owner email: {str(e)}")
            return False

    @staticmethod
    def send_collaborator_invitation_email(
        collaborator_email: str,
        collaborator_name: str,
        session_name: str,
        owner_name: str
    ) -> bool:
        """
        Send invitation email to new collaborator

        Args:
            collaborator_email: New collaborator's email address
            collaborator_name: New collaborator's name
            session_name: Name of the session
            owner_name: Name of the session owner

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build settings URL
            settings_url = f"{settings.FRONTEND_URL}/settings"

            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = f"You've Been Added to a Session - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = collaborator_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {collaborator_name},

{owner_name} has added you as a collaborator to their AretaCare session "{session_name}".

You now have full access to this session's data, including documents, conversations, journal entries, and audio recordings.

If you don't know {owner_name} or believe this was done in error, you can remove this connection by:
1. Logging into your AretaCare account
2. Going to the Collaboration page
3. Leaving the shared session

You can access the Collaboration page here: {settings.FRONTEND_URL}/collaboration

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">You've Been Added as a Collaborator</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {collaborator_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                <strong>{owner_name}</strong> has added you as a collaborator to their AretaCare session <strong>"{session_name}"</strong>.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You now have full access to this session's data, including documents, conversations, journal entries, and audio recordings.
                            </p>
                        </td>
                    </tr>

                    <!-- Info Box -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <div style="background-color: #ecfdf5; border-left: 4px solid #059669; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #065f46; font-size: 14px; font-weight: 600;">
                                    Don't recognize this person?
                                </p>
                                <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 20px;">
                                    If you don't know {owner_name} or believe this was done in error, you can remove this connection by:
                                </p>
                                <ol style="margin: 8px 0 0 20px; padding: 0; color: #065f46; font-size: 14px; line-height: 20px;">
                                    <li style="margin: 4px 0;">Logging into your AretaCare account</li>
                                    <li style="margin: 4px 0;">Going to the Collaboration page</li>
                                    <li style="margin: 4px 0;">Leaving the shared session</li>
                                </ol>
                            </div>
                        </td>
                    </tr>

                    <!-- Button -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <table role="presentation" style="margin: 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{settings.FRONTEND_URL}/collaboration" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Go to Collaboration
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Collaborator invitation sent successfully to {collaborator_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing collaborator invitation email: {str(e)}")
            return False

    @staticmethod
    def send_collaborator_removed_email(
        collaborator_email: str,
        collaborator_name: str,
        session_name: str,
        owner_name: str,
        owner_email: str
    ) -> bool:
        """
        Send notification to collaborator when removed from session

        Args:
            collaborator_email: Removed collaborator's email address
            collaborator_name: Removed collaborator's name
            session_name: Name of the session
            owner_name: Name of the session owner
            owner_email: Email of the session owner

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = f"Removed from Session - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = collaborator_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {collaborator_name},

You have been removed from the AretaCare session "{session_name}" by {owner_name}.

You no longer have access to this session's data.

If you believe you were removed in error, please contact {owner_name} directly at {owner_email}.

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Removed from Session</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {collaborator_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You have been removed from the AretaCare session <strong>"{session_name}"</strong> by <strong>{owner_name}</strong>.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You no longer have access to this session's data.
                            </p>
                        </td>
                    </tr>

                    <!-- Info Box -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 20px;">
                                    <strong>Removed in error?</strong> If you believe you were removed by mistake, please contact {owner_name} directly at <a href="mailto:{owner_email}" style="color: #1e40af; text-decoration: underline;">{owner_email}</a>.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Collaborator removal notification sent successfully to {collaborator_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing collaborator removed email: {str(e)}")
            return False

    def send_inactive_account_notification(self, user_email: str, user_name: str, days_inactive: int) -> bool:
        """Send notification to inactive account."""
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = "AretaCare - Account Inactivity Notice"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = user_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text = f"""
Hello {user_name},

We noticed that your AretaCare account has been inactive for {days_inactive} days.

To help manage our resources, we periodically review and may remove accounts that have been inactive for extended periods. Your account may be subject to deletion if it remains inactive.

If you'd like to keep your account active, simply log in at:
{settings.FRONTEND_URL}

If you have any questions or concerns, please contact us at support@aretacare.com

Thank you for using AretaCare.

---
This is an automated message from AretaCare.
"""

            # HTML version
            html = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
        .button {{ display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }}
        .warning {{ background-color: #fef3c7; border-left: 4px solid: #f59e0b; padding: 15px; margin: 20px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Account Inactivity Notice</h1>
        </div>
        <div class="content">
            <p>Hello {user_name},</p>

            <p>We noticed that your AretaCare account has been inactive for <strong>{days_inactive} days</strong>.</p>

            <div class="warning">
                <p><strong>Action May Be Required</strong></p>
                <p>To help manage our resources, we periodically review and may remove accounts that have been inactive for extended periods. Your account may be subject to deletion if it remains inactive.</p>
            </div>

            <p>If you'd like to keep your account active, simply log in:</p>

            <div style="text-align: center;">
                <a href="{settings.FRONTEND_URL}" class="button">Log In to AretaCare</a>
            </div>

            <p>If you have any questions or concerns, please <a href="mailto:support@aretacare.com">contact us</a>.</p>

            <p>Thank you for using AretaCare.</p>
        </div>
        <div class="footer">
            <p>This is an automated message from AretaCare.</p>
            <p>You received this email because you have an account at AretaCare.</p>
        </div>
    </div>
</body>
</html>
"""

            part1 = MIMEText(text, "plain")
            part2 = MIMEText(html, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Inactive account notification sent successfully to {user_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing inactive account notification: {str(e)}")
            return False

    @staticmethod
    def send_ownership_transferred_to_new_owner_email(
        new_owner_email: str,
        new_owner_name: str,
        session_name: str,
        old_owner_name: str
    ) -> bool:
        """
        Send notification to new owner when ownership is transferred

        Args:
            new_owner_email: New owner's email address
            new_owner_name: New owner's name
            session_name: Name of the session
            old_owner_name: Name of the previous owner

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build collaboration URL
            collaboration_url = f"{settings.FRONTEND_URL}/collaboration"

            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = f"You're Now the Owner of \"{session_name}\" - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = new_owner_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {new_owner_name},

{old_owner_name} has transferred ownership of the AretaCare session "{session_name}" to you.

You are now the session owner with full control, including:
- Managing collaborators (add/remove/transfer ownership)
- Renaming the session
- Deleting the session

{old_owner_name} has been added as a collaborator and can still access all session data.

You can manage this session on the Collaboration page: {collaboration_url}

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Session Ownership Transferred</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {new_owner_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                <strong>{old_owner_name}</strong> has transferred ownership of the AretaCare session <strong>"{session_name}"</strong> to you.
                            </p>
                        </td>
                    </tr>

                    <!-- Info Box -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <div style="background-color: #ecfdf5; border-left: 4px solid #059669; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #065f46; font-size: 14px; font-weight: 600;">
                                    As the New Owner
                                </p>
                                <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 20px;">
                                    You now have full control of this session:
                                </p>
                                <ul style="margin: 8px 0 0 20px; padding: 0; color: #065f46; font-size: 14px; line-height: 20px;">
                                    <li style="margin: 4px 0;">Manage collaborators (add/remove/transfer)</li>
                                    <li style="margin: 4px 0;">Rename the session</li>
                                    <li style="margin: 4px 0;">Delete the session</li>
                                </ul>
                                <p style="margin: 8px 0 0; color: #065f46; font-size: 14px; line-height: 20px;">
                                    <strong>{old_owner_name}</strong> has been added as a collaborator and can still access all session data.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Button -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <table role="presentation" style="margin: 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{collaboration_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Manage Collaboration
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Ownership transfer notification sent successfully to new owner {new_owner_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing ownership transfer notification to new owner: {str(e)}")
            return False

    @staticmethod
    def send_invitation_email(
        to_email: str,
        inviter_name: str,
        session_name: str,
        registration_url: str
    ) -> bool:
        """
        Send invitation email to a user who doesn't have an AretaCare account yet

        Args:
            to_email: Email address of the person being invited
            inviter_name: Name of the person sending the invitation
            session_name: Name of the session they're being invited to
            registration_url: URL to the registration page with pre-populated email and token

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = f"{inviter_name} Invited You to Join AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello,

{inviter_name} has invited you to join AretaCare to collaborate on their session "{session_name}".

AretaCare helps you make sense of complicated medical information, stay organized through stressful moments, and have confident conversations with your care team. Once you create a free account, you'll have access to the shared session.

To accept this invitation and create your account, visit:

{registration_url}

Your email address will be pre-filled on the registration page. After you complete the registration, you'll automatically have access to the shared session.

IMPORTANT: This invitation will expire in 30 days. After that, {inviter_name} will need to send you a new invitation.

If you have any questions about AretaCare, visit our website at {settings.FRONTEND_URL}/about

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">You've Been Invited to AretaCare</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello,
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                <strong>{inviter_name}</strong> has invited you to join AretaCare to collaborate on their session <strong>"{session_name}"</strong>.
                            </p>
                        </td>
                    </tr>

                    <!-- Info Box -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <div style="background-color: #ecfdf5; border-left: 4px solid #059669; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #065f46; font-size: 14px; font-weight: 600;">
                                    What is AretaCare?
                                </p>
                                <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 20px;">
                                    AretaCare helps you make sense of complicated medical information, stay organized through stressful moments, and have confident conversations with your care team. Once you create a free account, you'll have access to the shared session.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Button -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                To accept this invitation and create your account, click the button below:
                            </p>
                            <table role="presentation" style="margin: 16px 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{registration_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Create Your Account
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 16px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="{registration_url}" style="color: #059669; text-decoration: none; word-break: break-all;">{registration_url}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Note -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 20px;">
                                    <strong>Note:</strong> Your email address will be pre-filled on the registration page. After you complete the registration, you'll automatically have access to the shared session.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Expiration Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> This invitation will expire in 30 days. After that, {inviter_name} will need to send you a new invitation.
                                </p>
                            </div>
                            <p style="margin: 16px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                If you have questions about AretaCare, visit our <a href="{settings.FRONTEND_URL}/about" style="color: #059669; text-decoration: none;">About page</a>.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                logger.info(f"Development mode: Invitation link: {registration_url}")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Invitation email sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing invitation email: {str(e)}")
            return False

    @staticmethod
    def send_invitation_accepted_email(
        owner_email: str,
        owner_name: str,
        new_user_name: str,
        new_user_email: str,
        session_name: str
    ) -> bool:
        """
        Send notification to session owner when their invitation is accepted

        Args:
            owner_email: Session owner's email address
            owner_name: Session owner's name
            new_user_name: Name of the person who accepted
            new_user_email: Email of the person who accepted
            session_name: Name of the session

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build collaboration URL
            collaboration_url = f"{settings.FRONTEND_URL}/collaboration"

            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = f"{new_user_name} Accepted Your AretaCare Invitation"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = owner_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {owner_name},

Great news: {new_user_name} ({new_user_email}) has accepted your invitation and created an AretaCare account.

They now have full access to your session "{session_name}" and can view and edit all session data, including conversations, journal entries, documents, and audio recordings.

You can manage your collaborators at any time on the Collaboration page: {collaboration_url}

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Invitation Accepted</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {owner_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Great news: <strong>{new_user_name}</strong> ({new_user_email}) has accepted your invitation and created an AretaCare account.
                            </p>
                        </td>
                    </tr>

                    <!-- Success Box -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <div style="background-color: #ecfdf5; border-left: 4px solid #059669; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #065f46; font-size: 14px; font-weight: 600;">
                                    {new_user_name} now has access to:
                                </p>
                                <ul style="margin: 8px 0 0 20px; padding: 0; color: #065f46; font-size: 14px; line-height: 20px;">
                                    <li style="margin: 4px 0;">Your session: <strong>"{session_name}"</strong></li>
                                    <li style="margin: 4px 0;">All conversations and messages</li>
                                    <li style="margin: 4px 0;">Journal entries</li>
                                    <li style="margin: 4px 0;">Uploaded documents</li>
                                    <li style="margin: 4px 0;">Audio recordings</li>
                                    <li style="margin: 4px 0;">Daily digests</li>
                                </ul>
                            </div>
                        </td>
                    </tr>

                    <!-- Button -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You can manage your collaborators at any time on the Collaboration page.
                            </p>
                            <table role="presentation" style="margin: 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{collaboration_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Manage Collaborators
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Invitation accepted notification sent successfully to {owner_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing invitation accepted email: {str(e)}")
            return False

    @staticmethod
    def send_feedback_to_team(
        user_name: str,
        user_email: str,
        feedback_types: str,
        message: str,
        metadata: dict
    ) -> bool:
        """
        Send feedback submission to AretaCare team

        Args:
            user_name: Name of the user submitting feedback
            user_email: Email of the user submitting feedback
            feedback_types: Types of feedback (comma-separated: bug, improvement, feature, other)
            message: The feedback message
            metadata: Additional diagnostic metadata

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Format feedback types for display
            type_mapping = {
                "bug": "Bug Report",
                "improvement": "Suggested Improvement",
                "feature": "New Feature Request",
                "other": "Other Feedback"
            }

            # Convert comma-separated types to display format
            types_list = [t.strip() for t in feedback_types.split(",")]
            feedback_type_display = ", ".join([type_mapping.get(t, t.title()) for t in types_list])

            # Create message
            email_message = MIMEMultipart("alternative")
            email_message["Subject"] = f"[{feedback_type_display}] Feedback from {user_name}"
            email_message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            email_message["To"] = settings.FEEDBACK_EMAIL
            EmailService._add_deliverability_headers(email_message)
            del email_message["Reply-To"]  # Remove default Reply-To before override
            email_message["Reply-To"] = user_email  # Set to reply to user

            # Plain text version
            text_content = f"""
New Feedback Submission

Type: {feedback_type_display}
From: {user_name} ({user_email})

Message:
{message}

---
Diagnostic Information:
User ID: {metadata.get('user_id', 'N/A')}
Page URL: {metadata.get('page_url', 'N/A')}
User Agent: {metadata.get('user_agent', 'N/A')}
Client IP: {metadata.get('client_ip', 'N/A')}
"""

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Feedback Submission</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">New {feedback_type_display}</h2>

                            <!-- User Info Box -->
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 4px; margin: 24px 0;">
                                <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-weight: 600;">Submitted by:</p>
                                <p style="margin: 4px 0; color: #374151; font-size: 14px;">
                                    <strong>Name:</strong> {user_name}
                                </p>
                                <p style="margin: 4px 0; color: #374151; font-size: 14px;">
                                    <strong>Email:</strong> <a href="mailto:{user_email}" style="color: #059669; text-decoration: none;">{user_email}</a>
                                </p>
                            </div>

                            <!-- Message -->
                            <div style="background-color: #ffffff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 4px; margin: 24px 0;">
                                <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; font-weight: 600;">Message:</p>
                                <p style="margin: 0; color: #374151; font-size: 14px; line-height: 20px; white-space: pre-wrap;">{message}</p>
                            </div>

                            <!-- Diagnostic Info -->
                            <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 24px 0;">
                                <p style="margin: 0 0 8px; color: #1e40af; font-size: 12px; font-weight: 600;">Diagnostic Information:</p>
                                <p style="margin: 4px 0; color: #1e40af; font-size: 12px;">
                                    <strong>User ID:</strong> {metadata.get('user_id', 'N/A')}
                                </p>
                                <p style="margin: 4px 0; color: #1e40af; font-size: 12px; word-break: break-all;">
                                    <strong>Page URL:</strong> {metadata.get('page_url', 'N/A')}
                                </p>
                                <p style="margin: 4px 0; color: #1e40af; font-size: 12px; word-break: break-all;">
                                    <strong>User Agent:</strong> {metadata.get('user_agent', 'N/A')}
                                </p>
                                <p style="margin: 4px 0; color: #1e40af; font-size: 12px;">
                                    <strong>Client IP:</strong> {metadata.get('client_ip', 'N/A')}
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                AretaCare Feedback System
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            email_message.attach(part1)
            email_message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(email_message):
                logger.info(f"Feedback email sent to team from {user_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing feedback to team: {str(e)}")
            return False

    @staticmethod
    def send_feedback_confirmation(
        user_email: str,
        user_name: str,
        feedback_types: str,
        message: str
    ) -> bool:
        """
        Send confirmation email to user after feedback submission

        Args:
            user_email: User's email address
            user_name: User's name
            feedback_types: Types of feedback submitted (comma-separated)
            message: The feedback message they submitted

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Format feedback types for display
            type_mapping = {
                "bug": "bug report",
                "improvement": "suggested improvement",
                "feature": "new feature request",
                "other": "feedback"
            }

            # Convert comma-separated types to display format
            types_list = [t.strip() for t in feedback_types.split(",")]
            feedback_type_display = ", ".join([type_mapping.get(t, t) for t in types_list])

            # Create message
            email_message = MIMEMultipart("alternative")
            email_message["Subject"] = f"Thank you for your feedback - AretaCare"
            email_message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            email_message["To"] = user_email
            EmailService._add_deliverability_headers(email_message)
            del email_message["Reply-To"]  # Remove default Reply-To before override
            email_message["Reply-To"] = settings.FEEDBACK_EMAIL  # Allow user to continue conversation

            # Plain text version
            text_content = f"""
Hello {user_name},

Thank you for taking the time to share your feedback with us. We've received your submission and will review it carefully.

Your feedback helps us improve AretaCare for everyone. We appreciate you being part of our community.

What you submitted:

{message}

---

If you have any additional information to share, please feel free to submit another feedback form or contact us at feedback@aretacare.com.

Best regards,
The AretaCare Team
"""

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Thank you for your feedback</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Thank you for taking the time to share your feedback with us. We've received your submission and will review it carefully.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Your feedback helps us improve AretaCare for everyone. We appreciate you being part of our community.
                            </p>
                        </td>
                    </tr>

                    <!-- Feedback Preview -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #ecfdf5; border-left: 4px solid #059669; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #065f46; font-size: 14px; font-weight: 600;">
                                    What you submitted:
                                </p>
                                <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 20px; white-space: pre-wrap;">{message}</p>
                            </div>

                            <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                If you have any additional information to share, please feel free to submit another feedback form or contact us at <a href="mailto:feedback@aretacare.com" style="color: #059669; text-decoration: none;">feedback@aretacare.com</a>.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            email_message.attach(part1)
            email_message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(email_message):
                logger.info(f"Feedback confirmation sent to {user_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing feedback confirmation: {str(e)}")
            return False

    @staticmethod
    def send_ownership_transferred_from_old_owner_email(
        old_owner_email: str,
        old_owner_name: str,
        session_name: str,
        new_owner_name: str
    ) -> bool:
        """
        Send notification to old owner when they transfer ownership

        Args:
            old_owner_email: Old owner's email address
            old_owner_name: Old owner's name
            session_name: Name of the session
            new_owner_name: Name of the new owner

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build collaboration URL
            collaboration_url = f"{settings.FRONTEND_URL}/collaboration"

            # Create message
            message = MIMEMultipart("alternative")
            message["Subject"] = f"Ownership Transferred for \"{session_name}\" - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = old_owner_email
            EmailService._add_deliverability_headers(message)

            # Plain text version
            text_content = f"""
Hello {old_owner_name},

You have successfully transferred ownership of the AretaCare session "{session_name}" to {new_owner_name}.

{new_owner_name} is now the session owner and can:
- Manage collaborators (add/remove/transfer ownership)
- Rename the session
- Delete the session

You have been added as a collaborator and can still access all session data. However, you can no longer manage the session or its collaborators.

If you want to leave this session, you can do so on the Collaboration page: {collaboration_url}

Best regards,
The AretaCare Team
            """

            # HTML version
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Ownership Transferred</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {old_owner_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You have successfully transferred ownership of the AretaCare session <strong>"{session_name}"</strong> to <strong>{new_owner_name}</strong>.
                            </p>
                        </td>
                    </tr>

                    <!-- Info Box -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0 0 8px; color: #1e40af; font-size: 14px; font-weight: 600;">
                                    What This Means
                                </p>
                                <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 20px;">
                                    <strong>{new_owner_name}</strong> is now the session owner and can:
                                </p>
                                <ul style="margin: 8px 0 0 20px; padding: 0; color: #1e40af; font-size: 14px; line-height: 20px;">
                                    <li style="margin: 4px 0;">Manage collaborators (add/remove/transfer)</li>
                                    <li style="margin: 4px 0;">Rename the session</li>
                                    <li style="margin: 4px 0;">Delete the session</li>
                                </ul>
                                <p style="margin: 8px 0 0; color: #1e40af; font-size: 14px; line-height: 20px;">
                                    You have been added as a collaborator and can still access all session data. However, you can no longer manage the session or its collaborators.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Button -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <table role="presentation" style="margin: 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{collaboration_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            View Collaboration
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            # Attach both versions
            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            # Check if SMTP password is configured
            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Ownership transfer notification sent successfully to old owner {old_owner_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing ownership transfer notification to old owner: {str(e)}")
            return False

    @staticmethod
    def send_waitlist_invitation(to_email: str, invitation_token: str) -> bool:
        """
        Send invitation email to waitlist user

        Args:
            to_email: User's email address
            invitation_token: Token for registration

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            register_url = f"{settings.FRONTEND_URL}/register?email={to_email}&token={invitation_token}"

            message = MIMEMultipart("alternative")
            message["Subject"] = "You're Invited to Join AretaCare!"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            text_content = f"""
You're Invited to Join AretaCare!

Great news, you're invited to join AretaCare. Click on the link to create your account.

{register_url}

This invitation link will expire in 7 days.

What is AretaCare?
AretaCare helps you make sense of complicated medical information, stay organized through stressful moments, and have confident conversations with your care team.

If you have any questions, visit our About page at {settings.FRONTEND_URL}/about

Best regards,
The AretaCare Team
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">You're Invited!</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Great news, you're invited to join AretaCare. Click on the link to create your account.
                            </p>

                            <!-- Button -->
                            <table role="presentation" style="margin: 32px 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{register_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Create Your Account
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="{register_url}" style="color: #059669; text-decoration: none; word-break: break-all;">{register_url}</a>
                            </p>

                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

                            <h3 style="margin: 0 0 12px; color: #374151; font-size: 16px;">What is AretaCare?</h3>
                            <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; line-height: 22px;">
                                AretaCare helps you make sense of complicated medical information, stay organized through stressful moments, and have confident conversations with your care team.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> This invitation link will expire in 7 days.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                logger.info(f"Development mode: Waitlist invitation link: {register_url}")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Waitlist invitation email sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing waitlist invitation email: {str(e)}")
            return False

    @staticmethod
    def send_waitlist_user_registered(
        to_email: str,
        to_name: str,
        new_user_name: str,
        new_user_email: str,
        session_name: str
    ) -> bool:
        """
        Send notification to a user who tried to add someone as a collaborator,
        informing them that the person has now registered.

        Args:
            to_email: Email of the user who tried to add the collaborator
            to_name: Name of the user who tried to add the collaborator
            new_user_name: Name of the newly registered user
            new_user_email: Email of the newly registered user
            session_name: Name of the session they wanted to share

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            collaboration_url = f"{settings.FRONTEND_URL}/collaboration"

            message = MIMEMultipart("alternative")
            message["Subject"] = f"{new_user_name} Has Joined AretaCare!"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            text_content = f"""
Hello {to_name},

Good news! {new_user_name} ({new_user_email}) has joined AretaCare.

You previously tried to add them as a collaborator on "{session_name}". Now that they have an account, you can add them as a collaborator.

Visit your Collaboration page to add them:
{collaboration_url}

Best regards,
The AretaCare Team
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">{new_user_name} Has Joined!</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {to_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Good news! <strong>{new_user_name}</strong> ({new_user_email}) has joined AretaCare.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You previously tried to add them as a collaborator on "<strong>{session_name}</strong>". Now that they have an account, you can add them as a collaborator.
                            </p>

                            <!-- Button -->
                            <table role="presentation" style="margin: 32px 0;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{collaboration_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Add Collaborator
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Waitlist user registered notification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing waitlist user registered notification: {str(e)}")
            return False


    @staticmethod
    def send_mfa_enabled_email(to_email: str, user_name: str, method: str) -> bool:
        """
        Send notification email when MFA is enabled

        Args:
            to_email: Recipient email address
            user_name: Name of the user
            method: MFA method enabled (passkey or totp)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            method_name = "Passkey" if method == "passkey" else "Authenticator App"

            message = MIMEMultipart("alternative")
            message["Subject"] = "Two-Factor Authentication Enabled - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            text_content = f"""
Hello {user_name},

Two-factor authentication has been enabled on your AretaCare account using {method_name}.

Your account is now more secure. You will be required to verify your identity using your second factor when logging in from new devices.

If you did NOT make this change, please contact AretaCare security immediately at security@aretacare.com.

Best regards,
The AretaCare Team
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <div style="background-color: #d1fae5; border-radius: 50%; width: 64px; height: 64px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                                <span style="font-size: 32px;">🔐</span>
                            </div>
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px; text-align: center;">Two-Factor Authentication Enabled</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Two-factor authentication has been enabled on your AretaCare account using <strong>{method_name}</strong>.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Your account is now more secure. You will be required to verify your identity using your second factor when logging in from new devices.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare security immediately at <a href="mailto:security@aretacare.com" style="color: #92400e; text-decoration: underline;">security@aretacare.com</a>.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"MFA enabled notification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing MFA enabled email: {str(e)}")
            return False

    @staticmethod
    def send_mfa_disabled_email(to_email: str, user_name: str) -> bool:
        """
        Send notification email when MFA is disabled

        Args:
            to_email: Recipient email address
            user_name: Name of the user

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = "⚠️ Two-Factor Authentication Disabled - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            text_content = f"""
Hello {user_name},

Two-factor authentication has been DISABLED on your AretaCare account.

Your account is now less secure. We strongly recommend re-enabling two-factor authentication to protect your account.

If you did NOT make this change, please contact AretaCare security immediately at security@aretacare.com and change your password.

Best regards,
The AretaCare Team
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Alert Banner -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; text-align: center;">
                                <span style="font-size: 32px;">⚠️</span>
                                <p style="margin: 8px 0 0; color: #991b1b; font-size: 16px; font-weight: 600;">Security Alert</p>
                            </div>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Two-Factor Authentication Disabled</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Two-factor authentication has been <strong>disabled</strong> on your AretaCare account.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Your account is now less secure. We strongly recommend re-enabling two-factor authentication to protect your account.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare security immediately at <a href="mailto:security@aretacare.com" style="color: #991b1b; text-decoration: underline;">security@aretacare.com</a> and change your password.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"MFA disabled notification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing MFA disabled email: {str(e)}")
            return False

    @staticmethod
    def send_mfa_reset_by_admin_email(to_email: str, user_name: str) -> bool:
        """
        Send notification email when MFA is reset by an admin.

        Args:
            to_email: Recipient email address
            user_name: Name of the user

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = "🔓 Two-Factor Authentication Reset - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            text_content = f"""
Hello {user_name},

Two-factor authentication has been RESET on your AretaCare account by an administrator.

This was done to help you regain access to your account. You can now log in using just your email and password.

We strongly recommend setting up two-factor authentication again after logging in to keep your account secure. You can do this in Settings > Security.

If you did NOT request this change, please contact AretaCare support immediately at support@aretacare.com.

Best regards,
The AretaCare Team
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 20px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Two-Factor Authentication Reset</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Two-factor authentication has been <strong>reset</strong> on your AretaCare account by an administrator.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                This was done to help you regain access to your account. You can now log in using just your email and password.
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                We strongly recommend setting up two-factor authentication again after logging in to keep your account secure. You can do this in <strong>Settings &gt; Security</strong>.
                            </p>
                        </td>
                    </tr>

                    <!-- Info -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 20px;">
                                    <strong>Note:</strong> If you did NOT request this change, please contact AretaCare support immediately at <a href="mailto:support@aretacare.com" style="color: #1e40af; text-decoration: underline;">support@aretacare.com</a>.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"MFA reset by admin notification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing MFA reset by admin email: {str(e)}")
            return False

    @staticmethod
    def send_new_passkey_email(to_email: str, user_name: str, device_name: str) -> bool:
        """
        Send notification email when a new passkey is registered

        Args:
            to_email: Recipient email address
            user_name: Name of the user
            device_name: Name of the device/passkey

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = "New Passkey Added - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            text_content = f"""
Hello {user_name},

A new passkey named "{device_name}" has been added to your AretaCare account.

You can now use this passkey as a second factor when logging in.

If you did NOT add this passkey, please remove it from your account settings immediately and contact AretaCare security at security@aretacare.com.

Best regards,
The AretaCare Team
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">New Passkey Added</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                A new passkey has been added to your AretaCare account:
                            </p>
                            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                                <p style="margin: 0; color: #374151; font-size: 16px;">
                                    <strong>Passkey Name:</strong> {device_name}
                                </p>
                            </div>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                You can now use this passkey as a second factor when logging in.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> If you did NOT add this passkey, please remove it from your account settings immediately and contact AretaCare security at <a href="mailto:security@aretacare.com" style="color: #92400e; text-decoration: underline;">security@aretacare.com</a>.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"New passkey notification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing new passkey email: {str(e)}")
            return False

    @staticmethod
    def send_new_trusted_device_email(to_email: str, user_name: str, device_name: str, ip_address: str) -> bool:
        """
        Send notification email when a new device is trusted

        Args:
            to_email: Recipient email address
            user_name: Name of the user
            device_name: Browser/device info
            ip_address: IP address of the device

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = "New Trusted Device - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = to_email
            EmailService._add_deliverability_headers(message)

            text_content = f"""
Hello {user_name},

A new device has been trusted for your AretaCare account:

Device: {device_name}
IP Address: {ip_address}

This device will be trusted for 30 days and will not require two-factor authentication during that time.

If you did NOT authorize this device, please log in to your account and revoke this trusted device immediately. You should also change your password.

Best regards,
The AretaCare Team
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center;">
                            <h1 style="margin: 0; color: #059669; font-size: 36px;">AretaCare<span style="font-size: 20px; vertical-align: super;">™</span></h1>
                            <p style="margin: 10px 0 0; color: #6b7280; font-size: 18px; letter-spacing: 0.5px;">Care | Clarity | Confidence</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">New Trusted Device</h2>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                Hello {user_name},
                            </p>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                A new device has been trusted for your AretaCare account:
                            </p>
                            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                                <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">
                                    <strong>Device:</strong> {device_name}
                                </p>
                                <p style="margin: 0; color: #374151; font-size: 14px;">
                                    <strong>IP Address:</strong> {ip_address}
                                </p>
                            </div>
                            <p style="margin: 0 0 16px; color: #374151; font-size: 16px; line-height: 24px;">
                                This device will be trusted for 30 days and will not require two-factor authentication during that time.
                            </p>
                        </td>
                    </tr>

                    <!-- Warning -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                                    <strong>Important:</strong> If you did NOT authorize this device, please log in to your account and revoke this trusted device immediately. You should also change your password.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                Best regards,<br>
                                The AretaCare Team
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Email not sent. Using development mode.")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"New trusted device notification sent successfully to {to_email}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing new trusted device email: {str(e)}")
            return False

    @staticmethod
    def send_security_alert_email(
        event_type: str,
        email: Optional[str] = None,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        endpoint: Optional[str] = None,
        details: Optional[str] = None,
        timestamp: Optional[datetime] = None
    ) -> bool:
        """
        Send security alert email to the security team.

        Args:
            event_type: Type of security event
            email: User email (if available)
            user_id: User ID (if available)
            ip_address: Client IP address
            user_agent: Client user agent string
            endpoint: API endpoint accessed
            details: Additional context
            timestamp: Event timestamp (defaults to now)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Format event type for display
            event_labels = {
                "failed_login": "Failed Login Attempt",
                "account_lockout": "Account Lockout",
                "invalid_token": "Invalid Token",
                "unauthorized_access": "Unauthorized Access",
                "mfa_login_invalid_token": "MFA Login - Invalid Token",
                "mfa_login_failed": "MFA Login Failed",
                "mfa_totp_setup_failed": "TOTP Setup Failed",
                "mfa_passkey_registration_failed": "Passkey Registration Failed",
                "mfa_disable_failed": "MFA Disable Failed",
                "mfa_action_verification_failed": "MFA Action Verification Failed",
                "blocked_file_upload": "Blocked File Upload",
                "upload_failure": "Upload Failure",
                "email_changed": "Email Address Changed"
            }
            event_label = event_labels.get(event_type, event_type.replace("_", " ").title())

            # Use provided timestamp or current time
            event_time = timestamp or datetime.utcnow()
            formatted_time = event_time.strftime("%Y-%m-%d %H:%M:%S UTC")

            # Truncate user agent for display
            display_user_agent = user_agent[:100] + "..." if user_agent and len(user_agent) > 100 else user_agent

            # Admin console URL
            admin_url = f"{settings.FRONTEND_URL}/admin/security-logs"

            message = MIMEMultipart("alternative")
            message["Subject"] = f"[SECURITY ALERT] {event_label} - AretaCare"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = settings.SECURITY_ALERT_EMAIL
            EmailService._add_deliverability_headers(message)

            text_content = f"""
SECURITY ALERT - AretaCare

Event: {event_label}
Time: {formatted_time}

Details:
- User Email: {email or 'N/A'}
- User ID: {user_id or 'N/A'}
- IP Address: {ip_address or 'Unknown'}
- User Agent: {display_user_agent or 'N/A'}
- Endpoint: {endpoint or 'N/A'}
- Additional Details: {details or 'None'}

View security logs: {admin_url}

This is an automated security alert from AretaCare.
            """

            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; background-color: #dc2626; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Security Alert</h1>
                            <p style="margin: 10px 0 0; color: #fecaca; font-size: 16px;">AretaCare Security Team</p>
                        </td>
                    </tr>

                    <!-- Event Badge -->
                    <tr>
                        <td style="padding: 20px 40px 0;">
                            <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; text-align: center;">
                                <span style="color: #dc2626; font-weight: 600; font-size: 18px;">{event_label}</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Event Details -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb; width: 120px;">Timestamp</td>
                                    <td style="padding: 8px 0; color: #111827; font-size: 14px; border-bottom: 1px solid #e5e7eb;">{formatted_time}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb;">User Email</td>
                                    <td style="padding: 8px 0; color: #111827; font-size: 14px; border-bottom: 1px solid #e5e7eb;">{email or '<span style="color: #9ca3af;">N/A</span>'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb;">User ID</td>
                                    <td style="padding: 8px 0; color: #111827; font-size: 14px; font-family: monospace; border-bottom: 1px solid #e5e7eb;">{user_id or '<span style="color: #9ca3af;">N/A</span>'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb;">IP Address</td>
                                    <td style="padding: 8px 0; color: #111827; font-size: 14px; font-family: monospace; border-bottom: 1px solid #e5e7eb;">{ip_address or '<span style="color: #9ca3af;">Unknown</span>'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb;">User Agent</td>
                                    <td style="padding: 8px 0; color: #111827; font-size: 12px; border-bottom: 1px solid #e5e7eb; word-break: break-all;">{display_user_agent or '<span style="color: #9ca3af;">N/A</span>'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; border-bottom: 1px solid #e5e7eb;">Endpoint</td>
                                    <td style="padding: 8px 0; color: #111827; font-size: 14px; font-family: monospace; border-bottom: 1px solid #e5e7eb;">{endpoint or '<span style="color: #9ca3af;">N/A</span>'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Details</td>
                                    <td style="padding: 8px 0; color: #111827; font-size: 14px;">{details or '<span style="color: #9ca3af;">None</span>'}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Action Button -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <table role="presentation" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 6px; background-color: #059669;">
                                        <a href="{admin_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            View Security Logs
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                                This is an automated security alert from AretaCare.<br>
                                Do not reply to this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            """

            part1 = MIMEText(text_content, "plain")
            part2 = MIMEText(html_content, "html")
            message.attach(part1)
            message.attach(part2)

            if not settings.SMTP_PASSWORD:
                logger.warning("SMTP_PASSWORD not configured. Security alert not sent. Using development mode.")
                logger.info(f"Development mode: Security alert - {event_label} for {email or 'unknown user'}")
                return False

            # Send email with retry
            if EmailService._send_with_retry(message):
                logger.info(f"Security alert email sent successfully: {event_label}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error preparing security alert email: {str(e)}")
            return False


# Global instance
email_service = EmailService()
