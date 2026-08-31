"""
Admin email campaigns: sanitization, plain-text generation, and the background
send job.

Sending N emails cannot run inside the request — smtplib is blocking and
Cloudflare 524s any request without an origin response after ~100s — so the
send runs in a daemon thread (the security_service._send_alert_async pattern)
that opens its OWN SessionLocal. Never hand it the request's session: on
FastAPI 0.104 the get_db yield-teardown ordering makes any session shared with
background work hold the pooled connection for the whole job (see
audio_transcription_service.py).

Correctness rules, mirroring the audio transcription job:
- The campaign row is claimed with an atomic UPDATE whose WHERE embeds the
  staleness predicate, so a claim is exclusive: `pending`, or `sending` with a
  heartbeat older than CAMPAIGN_STALE_SECONDS (a dead instance).
- Each recipient is individually claimed `pending` -> `sending` with a
  query-update before any mail is sent. Even if a stale reclaim races a
  paused-but-alive original job, a recipient can only be claimed once, so a
  user gets at most one copy. Rows orphaned in `sending` by a process death
  are marked failed/interrupted on the next claim — resume never re-sends.
- Campaign counters are bumped per recipient with `WHERE status = 'sending'`,
  which doubles as the heartbeat behind the stale rule.
- A `sending` campaign whose heartbeat is stale is *reported* as `stalled`
  (read-time only, like effective_transcription_status); the admin can resume.
"""
import logging
import secrets
import threading
from datetime import datetime, timedelta
from html.parser import HTMLParser
from typing import Dict, Optional

import nh3
import sentry_sdk
from sqlalchemy import or_, and_, func

from app.core.config import settings
from app.models.email_campaign import EmailCampaign, EmailCampaignRecipient
from app.models.user import User

logger = logging.getLogger(__name__)

# No heartbeat for this long => the owning instance is presumed dead. Worst
# healthy per-recipient case is ~100s (3 SMTP attempts x 30s timeout + backoff),
# so 10 minutes is a 6x margin.
CAMPAIGN_STALE_SECONDS = 600

# Everything TipTap's StarterKit (+ Link) can emit, nothing more. style/class/
# img are deliberately absent: images in email are a tracking/exfiltration
# surface and the composer offers no way to produce them anyway.
CAMPAIGN_ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "a",
    "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "hr", "code", "pre",
}
CAMPAIGN_ALLOWED_ATTRIBUTES = {"a": {"href"}}


def sanitize_campaign_html(raw_html: str) -> str:
    """Allowlist-sanitize admin-composed HTML before it is stored or sent.

    This is the single trust boundary for campaign bodies: everything
    downstream (the email template, the DB row) treats the output as safe to
    interpolate unescaped.
    """
    return nh3.clean(
        raw_html,
        tags=CAMPAIGN_ALLOWED_TAGS,
        attributes=CAMPAIGN_ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
    )


class _PlainTextExtractor(HTMLParser):
    """Render sanitized campaign HTML as readable plain text for the
    multipart/alternative text part."""

    _BLOCK_TAGS = {"p", "h1", "h2", "h3", "blockquote", "ul", "ol", "pre"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self._href: Optional[str] = None
        self._link_text_parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            self.parts.append("\n")
        elif tag == "li":
            self.parts.append("\n- ")
        elif tag == "hr":
            self.parts.append("\n---\n")
        elif tag in self._BLOCK_TAGS:
            self.parts.append("\n\n")
        elif tag == "a":
            self._href = dict(attrs).get("href")
            self._link_text_parts = []

    def handle_endtag(self, tag):
        if tag == "a":
            text = "".join(self._link_text_parts).strip()
            if self._href and text and self._href != text:
                self.parts.append(f"{text} ({self._href})")
            else:
                self.parts.append(text or self._href or "")
            self._href = None
            self._link_text_parts = []
        elif tag in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._href is not None:
            self._link_text_parts.append(data)
        else:
            self.parts.append(data)


def html_to_plain_text(sanitized_html: str) -> str:
    parser = _PlainTextExtractor()
    parser.feed(sanitized_html)
    parser.close()
    text = "".join(parser.parts)
    # Collapse runs of blank lines and per-line whitespace noise.
    lines = [line.strip() for line in text.split("\n")]
    collapsed = []
    for line in lines:
        if line or (collapsed and collapsed[-1]):
            collapsed.append(line)
    return "\n".join(collapsed).strip()


def effective_campaign_status(campaign: EmailCampaign) -> str:
    """Read-time status: a pending/sending campaign with a stale heartbeat is
    reported as 'stalled' (resumable), never stored as such."""
    if campaign.status in ("pending", "sending"):
        stale_cutoff = datetime.utcnow() - timedelta(seconds=CAMPAIGN_STALE_SECONDS)
        heartbeat = campaign.updated_at or campaign.created_at
        if heartbeat < stale_cutoff:
            return "stalled"
    return campaign.status


def build_unsubscribe_url(token: str) -> str:
    return f"{settings.FRONTEND_URL}/unsubscribe?token={token}"


def build_one_click_url(token: str) -> Optional[str]:
    """RFC 8058 one-click target. Must be the API (providers POST to it); the
    static frontend cannot process that, so without API_PUBLIC_URL we fall back
    to a plain RFC 2369 header (handled in email_service)."""
    if not settings.API_PUBLIC_URL:
        return None
    base = settings.API_PUBLIC_URL.rstrip("/")
    return f"{base}/api/email/unsubscribe/one-click?token={token}"


# ---------------------------------------------------------------------------
# Background send job
# ---------------------------------------------------------------------------

_active_sends: Dict[str, threading.Thread] = {}
_sends_lock = threading.Lock()


def start_campaign_send(campaign_id: str) -> bool:
    """Start the background send for a campaign. Returns False if this
    instance already has a live thread for it (double-click guard); cross-
    instance exclusivity comes from the claim UPDATE inside the job."""
    with _sends_lock:
        existing = _active_sends.get(campaign_id)
        if existing is not None and existing.is_alive():
            logger.warning(f"Campaign {campaign_id} already has a live send thread on this instance")
            return False
        thread = threading.Thread(
            target=_run_campaign_send, args=(campaign_id,), daemon=True,
            name=f"email-campaign-{campaign_id[:8]}",
        )
        _active_sends[campaign_id] = thread
    thread.start()
    return True


def _run_campaign_send(campaign_id: str) -> None:
    from app.core.database import SessionLocal
    from app.services.email_service import EmailService

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        stale_cutoff = now - timedelta(seconds=CAMPAIGN_STALE_SECONDS)

        # Exclusive claim: pending, or sending-but-stale (previous owner died).
        claimed = db.query(EmailCampaign).filter(
            EmailCampaign.id == campaign_id,
            or_(
                EmailCampaign.status == "pending",
                and_(EmailCampaign.status == "sending", EmailCampaign.updated_at < stale_cutoff),
            ),
        ).update({
            EmailCampaign.status: "sending",
            EmailCampaign.started_at: func.coalesce(EmailCampaign.started_at, now),
            EmailCampaign.updated_at: now,
        }, synchronize_session=False)
        db.commit()
        if claimed == 0:
            logger.info(f"Campaign {campaign_id}: not claimable (owned elsewhere or terminal)")
            return

        # Recipients orphaned mid-send by a process death stay failed rather
        # than risking a duplicate email — resume only ever touches 'pending'.
        db.query(EmailCampaignRecipient).filter(
            EmailCampaignRecipient.campaign_id == campaign_id,
            EmailCampaignRecipient.status == "sending",
        ).update({
            EmailCampaignRecipient.status: "failed",
            EmailCampaignRecipient.error: "interrupted",
        }, synchronize_session=False)
        db.commit()

        smtp_configured = bool(settings.SMTP_PASSWORD)
        campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
        if campaign is None:
            return

        pending = db.query(EmailCampaignRecipient).filter(
            EmailCampaignRecipient.campaign_id == campaign_id,
            EmailCampaignRecipient.status == "pending",
        ).order_by(EmailCampaignRecipient.id).all()

        for recipient in pending:
            # Atomic per-recipient claim: at-most-once even under a racing
            # stale reclaim.
            took = db.query(EmailCampaignRecipient).filter(
                EmailCampaignRecipient.id == recipient.id,
                EmailCampaignRecipient.status == "pending",
            ).update({EmailCampaignRecipient.status: "sending"}, synchronize_session=False)
            db.commit()
            if took == 0:
                continue

            status = "failed"
            error = None
            user = db.query(User).filter(User.id == recipient.user_id).first() if recipient.user_id else None
            if user is None:
                status, error = "skipped", "user_deleted"
            elif user.email_unsubscribed_at is not None:
                # Re-checked at send time: the user may have unsubscribed
                # between selection and this moment.
                status, error = "skipped", "unsubscribed"
            elif not user.is_active or not user.is_email_verified:
                status, error = "skipped", "user_ineligible"
            elif not smtp_configured:
                status, error = "skipped", "smtp_not_configured"
                logger.info(
                    f"Development mode: campaign email to {user.email}; "
                    f"unsubscribe: {build_unsubscribe_url(_ensure_unsubscribe_token(db, user))}"
                )
            else:
                token = _ensure_unsubscribe_token(db, user)
                sent = EmailService.send_admin_campaign_email(
                    to_email=user.email,
                    user_name=user.name,
                    subject=campaign.subject,
                    body_html=campaign.body_html,
                    body_text=campaign.body_text,
                    unsubscribe_url=build_unsubscribe_url(token),
                    one_click_url=build_one_click_url(token),
                )
                if sent:
                    status = "sent"
                else:
                    status, error = "failed", "smtp_send_failed"

            db.query(EmailCampaignRecipient).filter(
                EmailCampaignRecipient.id == recipient.id,
                EmailCampaignRecipient.status == "sending",
            ).update({
                EmailCampaignRecipient.status: status,
                EmailCampaignRecipient.error: error,
                EmailCampaignRecipient.sent_at: datetime.utcnow() if status == "sent" else None,
            }, synchronize_session=False)

            counter = {
                "sent": EmailCampaign.sent_count,
                "failed": EmailCampaign.failed_count,
                "skipped": EmailCampaign.skipped_count,
            }[status]
            # Counter bump doubles as the heartbeat.
            db.query(EmailCampaign).filter(
                EmailCampaign.id == campaign_id,
                EmailCampaign.status == "sending",
            ).update({
                counter: counter + 1,
                EmailCampaign.updated_at: datetime.utcnow(),
            }, synchronize_session=False)
            db.commit()

        _finalize_campaign(db, campaign_id)

    except Exception as e:
        logger.error(f"Campaign {campaign_id} send job failed: {e}")
        sentry_sdk.capture_exception(e)
        try:
            db.rollback()
            db.query(EmailCampaign).filter(
                EmailCampaign.id == campaign_id,
                EmailCampaign.status == "sending",
            ).update({
                EmailCampaign.status: "failed",
                EmailCampaign.updated_at: datetime.utcnow(),
                EmailCampaign.completed_at: datetime.utcnow(),
            }, synchronize_session=False)
            db.commit()
        except Exception as inner:
            logger.error(f"Campaign {campaign_id}: failed to mark campaign failed: {inner}")
    finally:
        db.close()
        with _sends_lock:
            if _active_sends.get(campaign_id) is threading.current_thread():
                _active_sends.pop(campaign_id, None)


def _ensure_unsubscribe_token(db, user: User) -> str:
    """The create route generates tokens up front; this is a defensive
    backstop so a send never goes out with a broken unsubscribe link."""
    if not user.unsubscribe_token:
        user.unsubscribe_token = secrets.token_urlsafe(32)
        db.commit()
    return user.unsubscribe_token


def _finalize_campaign(db, campaign_id: str) -> None:
    """Set final status and heal the counters from the recipient rows (the
    source of truth), guarded on still owning the campaign."""
    rows = dict(
        db.query(EmailCampaignRecipient.status, func.count(EmailCampaignRecipient.id))
        .filter(EmailCampaignRecipient.campaign_id == campaign_id)
        .group_by(EmailCampaignRecipient.status).all()
    )
    sent = rows.get("sent", 0)
    failed = rows.get("failed", 0)
    skipped = rows.get("skipped", 0)

    if sent > 0 and failed == 0 and skipped == 0:
        final_status = "completed"
    elif sent > 0:
        final_status = "completed_with_errors"
    else:
        final_status = "failed" if failed > 0 else "completed_with_errors"

    now = datetime.utcnow()
    db.query(EmailCampaign).filter(
        EmailCampaign.id == campaign_id,
        EmailCampaign.status == "sending",
    ).update({
        EmailCampaign.status: final_status,
        EmailCampaign.sent_count: sent,
        EmailCampaign.failed_count: failed,
        EmailCampaign.skipped_count: skipped,
        EmailCampaign.updated_at: now,
        EmailCampaign.completed_at: now,
    }, synchronize_session=False)
    db.commit()
    logger.info(
        f"Campaign {campaign_id} finished: {final_status} "
        f"(sent={sent}, failed={failed}, skipped={skipped})"
    )
