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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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

If you did NOT make this change, please contact AretaCare support immediately at aretacare@gmail.com to secure your account.

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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare support immediately at <a href="mailto:aretacare@gmail.com" style="color: #92400e; text-decoration: underline;">aretacare@gmail.com</a> to secure your account.
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

If you did NOT make this change, please contact AretaCare support immediately at aretacare@gmail.com to secure your account.

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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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
                                    <strong>Important:</strong> If you did NOT make this change, please contact AretaCare support immediately at <a href="mailto:aretacare@gmail.com" style="color: #92400e; text-decoration: underline;">aretacare@gmail.com</a> to secure your account.
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

If you did NOT add this collaborator, please contact AretaCare support immediately at aretacare@gmail.com.

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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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
                                    <strong>Important:</strong> If you did NOT add this collaborator, please contact AretaCare support immediately at <a href="mailto:aretacare@gmail.com" style="color: #92400e; text-decoration: underline;">aretacare@gmail.com</a>.
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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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
            # Build settings URL
            settings_url = f"{settings.FRONTEND_URL}/settings"

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

You can manage this session in your account settings: {settings_url}

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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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
                                        <a href="{settings_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            Manage Sessions
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
            # Build settings URL
            settings_url = f"{settings.FRONTEND_URL}/settings"

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

If you want to leave this session, you can do so in your account settings: {settings_url}

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
                            <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">Care | Clarity | Confidence</p>
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
                                        <a href="{settings_url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                                            View Sessions
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


# Global instance
email_service = EmailService()
