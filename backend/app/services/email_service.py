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
                            <h1 style="margin: 0; color: #059669; font-size: 28px;">AretaCare</h1>
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">AI Care Advocate</p>
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
                            <h1 style="margin: 0; color: #059669; font-size: 28px;">AretaCare</h1>
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">AI Care Advocate</p>
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
                            <h1 style="margin: 0; color: #059669; font-size: 28px;">AretaCare</h1>
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">AI Care Advocate</p>
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
2. Going to Account Settings → Manage Sessions
3. Leaving the shared session

You can access your settings here: {settings_url}

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
                                    <li style="margin: 4px 0;">Going to Account Settings → Manage Sessions</li>
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
                                        <a href="{settings_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Go to Settings
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
                            <h1 style="margin: 0; color: #059669; font-size: 28px;">AretaCare</h1>
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">AI Care Advocate</p>
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


# Global instance
email_service = EmailService()
