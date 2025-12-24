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
            logger.error("Email authentication failed. Please verify SMTP credentials in environment configuration.")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email: {str(e)}")
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

            # Plain text version
            text_content = f"""
Hello {user_name},

Your AretaCare account password was recently changed.

If you made this change, no further action is needed.

If you did NOT make this change, please contact AretaCare support immediately at support@aretacare.com to secure your account.

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
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare support immediately at <a href="mailto:support@aretacare.com" style="color: #92400e; text-decoration: underline;">support@aretacare.com</a> to secure your account.
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Password changed notification sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending password changed email: {str(e)}")
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

            # Plain text version
            text_content = f"""
Hello {user_name},

Your AretaCare account email address was recently changed from {old_email} to {new_email}.

If you made this change, no further action is needed.

If you did NOT make this change, please contact AretaCare support immediately at support@aretacare.com to secure your account.

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
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare support immediately at <a href="mailto:support@aretacare.com" style="color: #92400e; text-decoration: underline;">support@aretacare.com</a> to secure your account.
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Email changed notification sent successfully to {old_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending email changed notification: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Email change verification sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending email change verification: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Registration verification email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending registration verification email: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Collaborator added notification sent to owner {owner_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending collaborator added to owner email: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Collaborator invitation sent successfully to {collaborator_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending collaborator invitation email: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Collaborator removal notification sent successfully to {collaborator_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending collaborator removed email: {str(e)}")
            return False

    def send_inactive_account_notification(self, user_email: str, user_name: str, days_inactive: int) -> bool:
        """Send notification to inactive account."""
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = "AretaCare - Account Inactivity Notice"
            message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            message["To"] = user_email

            # Plain text version
            text = f"""
Hello {user_name},

We noticed that your AretaCare account has been inactive for {days_inactive} days.

To help manage our resources, we periodically review and may remove accounts that have been inactive for extended periods. Your account may be subject to deletion if it remains inactive.

If you'd like to keep your account active, simply log in at:
{settings.FRONTEND_URL}

If you have any questions or concerns, please visit our GitHub repository:
https://github.com/artificiallyhuman/aretacare

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

            <p>If you have any questions or concerns, please visit our <a href="https://github.com/artificiallyhuman/aretacare">GitHub repository</a>.</p>

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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Inactive account notification sent successfully to {user_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending inactive account notification: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Ownership transfer notification sent successfully to new owner {new_owner_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending ownership transfer notification to new owner: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Invitation email sent successfully to {to_email}")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP Authentication failed: {str(e)}")
            logger.error("Email authentication failed. Please verify SMTP credentials in environment configuration.")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending invitation email: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Invitation accepted notification sent successfully to {owner_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending invitation accepted email: {str(e)}")
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
            email_message["Reply-To"] = user_email

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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(email_message)

            logger.info(f"Feedback email sent to team from {user_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending feedback to team: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(email_message)

            logger.info(f"Feedback confirmation sent to {user_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending feedback confirmation: {str(e)}")
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

            # Send email
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Ownership transfer notification sent successfully to old owner {old_owner_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending ownership transfer notification to old owner: {str(e)}")
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

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Waitlist invitation email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending waitlist invitation email: {str(e)}")
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

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)

            logger.info(f"Waitlist user registered notification sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Error sending waitlist user registered notification: {str(e)}")
            return False


# Global instance
email_service = EmailService()
