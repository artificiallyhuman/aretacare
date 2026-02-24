"""
Push notification service for sending APNs notifications.

Uses fire-and-forget daemon threads (matching SecurityService pattern)
so notification sends never block API responses.
"""
import asyncio
import base64
import logging
import os
import tempfile
import threading
from enum import Enum
from typing import List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    NEW_MESSAGE = "new_message"
    SESSION_SHARED = "session_shared"
    DAILY_DIGEST_READY = "daily_digest_ready"


class PushNotificationService:
    """APNs push notification service with fire-and-forget delivery."""

    _client = None
    _client_lock = threading.Lock()

    _resolved_key = None  # Cached key content string

    @classmethod
    def _resolve_key(cls) -> str | None:
        """
        Resolve APNs key content as a string (not a file path).
        Supports: APNS_KEY_CONTENT (base64 or raw PEM) or APNS_KEY_PATH (file).
        Returns the PEM string directly for aioapns.
        """
        if cls._resolved_key is not None:
            return cls._resolved_key

        content = None

        if settings.APNS_KEY_CONTENT:
            content = settings.APNS_KEY_CONTENT
            # Decode base64 if not already PEM
            if not content.strip().startswith("-----"):
                try:
                    content = base64.b64decode(content).decode("utf-8")
                except Exception:
                    logger.error("APNS_KEY_CONTENT is not valid PEM or base64")
                    return None
        elif settings.APNS_KEY_PATH:
            try:
                with open(settings.APNS_KEY_PATH, "r") as f:
                    content = f.read()
            except Exception as e:
                logger.error(f"Cannot read APNs key file at {settings.APNS_KEY_PATH}: {e}")
                return None

        if content:
            # Normalize whitespace
            content = content.strip().replace("\r\n", "\n").replace("\r", "\n")
            if not content.endswith("\n"):
                content += "\n"
            cls._resolved_key = content
            logger.info(
                f"APNs key loaded (starts with: {content[:27]}..., "
                f"lines: {content.count(chr(10))}, length: {len(content)})"
            )

        return cls._resolved_key

    @classmethod
    def _get_client(cls):
        """Lazy-init APNs client (singleton, thread-safe)."""
        if cls._client is None:
            with cls._client_lock:
                if cls._client is None:
                    if not settings.PUSH_NOTIFICATIONS_ENABLED:
                        return None
                    key = cls._resolve_key()
                    if not key or not settings.APNS_KEY_ID or not settings.APNS_TEAM_ID:
                        logger.warning("APNs configuration incomplete — push notifications disabled")
                        return None
                    try:
                        from aioapns import APNs
                        cls._client = APNs(
                            key=key,
                            key_id=settings.APNS_KEY_ID,
                            team_id=settings.APNS_TEAM_ID,
                            topic=settings.APNS_TOPIC,
                            use_sandbox=settings.APNS_USE_SANDBOX,
                        )
                        logger.info("APNs client initialized")
                    except Exception as e:
                        logger.error(f"Failed to initialize APNs client: {e}")
                        return None
        return cls._client

    @classmethod
    def _send_async(
        cls,
        user_ids: List[str],
        title: str,
        body: str,
        notification_type: NotificationType,
        data: Optional[dict] = None,
        exclude_user_id: Optional[str] = None,
    ):
        """
        Fire-and-forget push notification send in a background daemon thread.
        Mirrors SecurityService._send_alert_async() pattern.
        """
        if not settings.PUSH_NOTIFICATIONS_ENABLED:
            return

        def send():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    cls._send_to_users(user_ids, title, body, notification_type, data, exclude_user_id)
                )
            except Exception as e:
                logger.error(f"Push notification send failed: {e}")
            finally:
                loop.close()

        thread = threading.Thread(target=send, daemon=True)
        thread.start()

    @classmethod
    async def _send_to_users(
        cls,
        user_ids: List[str],
        title: str,
        body: str,
        notification_type: NotificationType,
        data: Optional[dict] = None,
        exclude_user_id: Optional[str] = None,
    ):
        """Look up device tokens for the given users and send to each."""
        from app.models.device_token import DeviceToken
        from app.core.database import SessionLocal

        client = cls._get_client()
        if client is None:
            return

        db = SessionLocal()
        try:
            query = db.query(DeviceToken).filter(DeviceToken.user_id.in_(user_ids))
            if exclude_user_id:
                query = query.filter(DeviceToken.user_id != exclude_user_id)
            tokens = query.all()

            if not tokens:
                return

            from aioapns import NotificationRequest

            for device_token in tokens:
                payload = {
                    "aps": {
                        "alert": {"title": title, "body": body},
                        "sound": "default",
                        "badge": 1,
                        "mutable-content": 1,
                    },
                    "notification_type": notification_type.value,
                }
                if data:
                    payload.update(data)

                request = NotificationRequest(
                    device_token=device_token.token,
                    message=payload,
                )
                try:
                    response = await client.send_notification(request)
                    if not response.is_successful:
                        logger.warning(
                            f"APNs error for token {device_token.token[:8]}...: "
                            f"{response.description}"
                        )
                        # Auto-clean invalid tokens
                        if response.description in ("BadDeviceToken", "Unregistered"):
                            db.delete(device_token)
                            db.commit()
                            logger.info(f"Removed invalid device token {device_token.token[:8]}...")
                except Exception as e:
                    logger.warning(f"Failed to send push to {device_token.token[:8]}...: {e}")
        finally:
            db.close()

    # ---- Convenience methods for each notification type ----

    @classmethod
    def notify_new_message(
        cls,
        session_id: str,
        session_name: str,
        sender_user_id: str,
        collaborator_user_ids: List[str],
    ):
        """Notify collaborators about a new message (excludes the sender)."""
        cls._send_async(
            user_ids=collaborator_user_ids,
            title="New Message",
            body=f"New message in {session_name}",
            notification_type=NotificationType.NEW_MESSAGE,
            data={"session_id": session_id},
            exclude_user_id=sender_user_id,
        )

    @classmethod
    def notify_session_shared(
        cls,
        session_name: str,
        owner_name: str,
        target_user_id: str,
    ):
        """Notify a user that they've been added to a session."""
        cls._send_async(
            user_ids=[target_user_id],
            title="Session Shared",
            body=f"{owner_name} shared a session with you",
            notification_type=NotificationType.SESSION_SHARED,
        )

    @classmethod
    def notify_daily_digest(
        cls,
        session_id: str,
        session_name: str,
        user_ids: List[str],
        exclude_user_id: Optional[str] = None,
    ):
        """Notify session participants that the daily digest is ready."""
        cls._send_async(
            user_ids=user_ids,
            title="Daily Digest Ready",
            body=f"Your daily digest for {session_name} is ready",
            notification_type=NotificationType.DAILY_DIGEST_READY,
            data={"session_id": session_id},
            exclude_user_id=exclude_user_id,
        )
