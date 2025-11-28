import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails via SMTP"""

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

            # Plain text version
            text_content = f"""
Hello,

You recently requested to reset your password for your AretaCare account. Click the link below to reset it:

{reset_url}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email or contact support if you have concerns.

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
                            <h1 style="margin: 0; color: #059669; font-size: 28px;">AretaCare</h1>
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">AI Care Advocate</p>
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
                                If you did not request a password reset, please ignore this email or contact support if you have concerns.
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Password reset email sent successfully to {to_email}")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP Authentication failed: {str(e)}")
            logger.error("Please check your SMTP_USER and SMTP_PASSWORD (use Gmail App Password, not regular password)")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email: {str(e)}")
            return False


# Global instance
email_service = EmailService()
