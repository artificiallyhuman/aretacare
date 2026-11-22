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

Delivery (why a 150-recipient send used to lose a third of its list):
- One SMTP connection serves the whole run (email_service.SMTPMailer,
  reconnecting every CAMPAIGN_MESSAGES_PER_CONNECTION messages), and sends are
  paced CAMPAIGN_SEND_INTERVAL_SECONDS apart. A fresh connection and login per
  message got the Gmail account throttled partway through the list.
- A temporary refusal (4xx, dropped connection, timeout) retries the same
  recipient after CAMPAIGN_TEMPORARY_RETRY_DELAYS, heartbeating while it waits
  and showing `paused_until` to the admin. If that runs out, or the server
  refuses in a way that would apply to every recipient (credentials, quota,
  content), the run stops: the current recipient and every one still pending
  are marked failed with that reason, instead of failing them one after
  another within seconds. A refused address fails just that recipient.
- "Retry failed" (reopen_for_retry) puts failures in RETRYABLE_RECIPIENT_ERRORS
  back to `pending` and starts the job again; sent rows are never touched.
  `interrupted` is not retryable: the process died mid-send, so that email may
  already have gone out. Nor is `smtp_send_failed`, the only failure code
  written before Retry existed: the admin had already re-sent those by hand.
"""
import logging
import secrets
import threading
import time
from datetime import datetime, timedelta
from html.parser import HTMLParser
from typing import Dict, Optional, Tuple

import nh3
import sentry_sdk
from sqlalchemy import or_, and_, func

from app.core.config import settings
from app.models.email_campaign import EmailCampaign, EmailCampaignRecipient
from app.models.user import User
from app.services.email_service import (
    SMTP_AUTH,
    SMTP_PERMANENT,
    SMTP_RECIPIENT,
    SMTP_TEMPORARY,
    SMTP_ERROR_DETAIL_MAX,
    SMTPMailer,
    classify_smtp_error,
)

logger = logging.getLogger(__name__)

# No heartbeat for this long => the owning instance is presumed dead. The job
# heartbeats after every recipient and every HEARTBEAT_INTERVAL_SECONDS while
# it waits out a rate limit, so the longest gap is one SMTP attempt (a few
# 30s socket timeouts at worst); 10 minutes is a wide margin.
CAMPAIGN_STALE_SECONDS = 600

# Delivery pacing (see the module docstring).
CAMPAIGN_SEND_INTERVAL_SECONDS = 1.0
CAMPAIGN_MESSAGES_PER_CONNECTION = 50
# Waits before each new attempt at the same recipient after a temporary SMTP
# failure: the first is immediate (a fresh connection fixes an idle
# disconnect), the rest give a throttled account ~7.5 minutes to recover.
CAMPAIGN_TEMPORARY_RETRY_DELAYS = (0, 30, 60, 120, 240)
HEARTBEAT_INTERVAL_SECONDS = 30

# Recipient `error` codes for SMTP failures. Rows from before these existed
# say smtp_send_failed (never written now).
ERROR_SMTP_THROTTLED = "smtp_throttled"
ERROR_SMTP_AUTH_FAILED = "smtp_auth_failed"
ERROR_SMTP_REJECTED = "smtp_rejected"
ERROR_RECIPIENT_REJECTED = "recipient_rejected"
_STOP_ERROR_BY_KIND = {
    SMTP_TEMPORARY: ERROR_SMTP_THROTTLED,
    SMTP_AUTH: ERROR_SMTP_AUTH_FAILED,
    SMTP_PERMANENT: ERROR_SMTP_REJECTED,
}

# Failures "Retry failed" puts back in the queue. Not recipient_rejected (the
# address would be refused again), interrupted (may already have been sent) or
# smtp_send_failed (failed before Retry existed; the admin re-sent those to
# everyone not recently emailed, so retrying would send a second copy).
RETRYABLE_RECIPIENT_ERRORS = frozenset({
    ERROR_SMTP_THROTTLED,
    ERROR_SMTP_AUTH_FAILED,
    ERROR_SMTP_REJECTED,
})
RETRYABLE_CAMPAIGN_STATUSES = ("completed_with_errors", "failed")


def is_retryable(status: str, error: Optional[str]) -> bool:
    return status == "failed" and error in RETRYABLE_RECIPIENT_ERRORS

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


class _ClaimLost(Exception):
    """The campaign is no longer 'sending' under this job; stop touching it."""


def active_campaign_exists(db) -> bool:
    """One campaign sends at a time. A stalled one (stale heartbeat: its
    instance died) does not count."""
    stale_cutoff = datetime.utcnow() - timedelta(seconds=CAMPAIGN_STALE_SECONDS)
    return db.query(EmailCampaign.id).filter(
        EmailCampaign.status.in_(["pending", "sending"]),
        EmailCampaign.updated_at >= stale_cutoff,
    ).first() is not None


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
            EmailCampaign.paused_until: None,
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

        with SMTPMailer(CAMPAIGN_MESSAGES_PER_CONNECTION) as mailer:
            attempted_send = False
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

                status, error, detail = "failed", None, None
                stop_run = False
                user = db.query(User).filter(User.id == recipient.user_id).first() if recipient.user_id else None
                if user is None:
                    status, error = "skipped", "user_deleted"
                elif user.email_unsubscribed_at is not None:
                    # Re-checked at send time: the user may have unsubscribed
                    # between selection and this moment (or before a retry).
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
                    message = EmailService.build_admin_campaign_message(
                        to_email=user.email,
                        user_name=user.name,
                        subject=campaign.subject,
                        body_html=campaign.body_html,
                        body_text=campaign.body_text,
                        unsubscribe_url=build_unsubscribe_url(token),
                        one_click_url=build_one_click_url(token),
                    )
                    if attempted_send:
                        time.sleep(CAMPAIGN_SEND_INTERVAL_SECONDS)
                    attempted_send = True
                    outcome, error, detail = _deliver(db, campaign_id, mailer, message)
                    if outcome == "sent":
                        status = "sent"
                    elif outcome == "stop":
                        stop_run = True

                _record_outcome(db, campaign_id, recipient.id, user, status, error, detail)

                if stop_run:
                    stopped = _fail_remaining(db, campaign_id, error, detail)
                    logger.warning(
                        f"Campaign {campaign_id}: stopped ({error}: {detail}); "
                        f"{stopped} recipient(s) left for Retry failed"
                    )
                    break

        _finalize_campaign(db, campaign_id)

    except _ClaimLost:
        logger.warning(f"Campaign {campaign_id}: no longer owned by this job; stopping")
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
                EmailCampaign.paused_until: None,
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


def _deliver(db, campaign_id: str, mailer: SMTPMailer, message) -> Tuple[str, Optional[str], Optional[str]]:
    """Send one message. Returns (outcome, error, detail):
    ("sent", None, None); ("rejected", recipient_rejected, reply) when only
    this address was refused; ("stop", reason, reply) when the run should stop
    because the next recipient would fare no better."""
    delays = iter(CAMPAIGN_TEMPORARY_RETRY_DELAYS)
    while True:
        try:
            mailer.send(message)
            return "sent", None, None
        except Exception as exc:
            kind, detail = classify_smtp_error(exc)

        if kind == SMTP_RECIPIENT:
            return "rejected", ERROR_RECIPIENT_REJECTED, detail
        if kind != SMTP_TEMPORARY:
            return "stop", _STOP_ERROR_BY_KIND[kind], detail
        delay = next(delays, None)
        if delay is None:
            return "stop", ERROR_SMTP_THROTTLED, detail
        logger.warning(f"Campaign {campaign_id}: temporary SMTP failure ({detail}); trying again in {delay}s")
        _wait_with_heartbeat(db, campaign_id, delay)


def _wait_with_heartbeat(db, campaign_id: str, seconds: float) -> None:
    """Sleep, keeping the heartbeat fresh and paused_until visible to the
    admin. Raises _ClaimLost if the campaign stopped being ours."""
    resume_at = datetime.utcnow() + timedelta(seconds=seconds)
    _touch(db, campaign_id, paused_until=resume_at if seconds > 0 else None)
    waited = 0.0
    while waited < seconds:
        step = min(HEARTBEAT_INTERVAL_SECONDS, seconds - waited)
        time.sleep(step)
        waited += step
        _touch(db, campaign_id, paused_until=resume_at if waited < seconds else None)


def _touch(db, campaign_id: str, paused_until: Optional[datetime]) -> None:
    touched = db.query(EmailCampaign).filter(
        EmailCampaign.id == campaign_id,
        EmailCampaign.status == "sending",
    ).update({
        EmailCampaign.updated_at: datetime.utcnow(),
        EmailCampaign.paused_until: paused_until,
    }, synchronize_session=False)
    db.commit()
    if touched == 0:
        raise _ClaimLost()


def _record_outcome(db, campaign_id: str, recipient_id: int, user: Optional[User],
                    status: str, error: Optional[str], detail: Optional[str]) -> None:
    sent_ts = datetime.utcnow() if status == "sent" else None
    db.query(EmailCampaignRecipient).filter(
        EmailCampaignRecipient.id == recipient_id,
        EmailCampaignRecipient.status == "sending",
    ).update({
        EmailCampaignRecipient.status: status,
        EmailCampaignRecipient.error: error,
        EmailCampaignRecipient.error_detail: detail,
        EmailCampaignRecipient.sent_at: sent_ts,
    }, synchronize_session=False)
    if sent_ts is not None:
        # Backs the email panel's "Last emailed" column/filter. Same commit
        # as the recipient outcome and the counter bump below.
        db.query(User).filter(User.id == user.id).update(
            {User.last_emailed_at: sent_ts}, synchronize_session=False
        )

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


def _fail_remaining(db, campaign_id: str, error: str, detail: Optional[str]) -> int:
    """Mark every recipient not yet attempted as failed with the reason the
    run stopped, so "Retry failed" picks them up. Returns how many."""
    note = f"Not attempted: the send stopped after {detail}" if detail else "Not attempted: the send stopped"
    stopped = db.query(EmailCampaignRecipient).filter(
        EmailCampaignRecipient.campaign_id == campaign_id,
        EmailCampaignRecipient.status == "pending",
    ).update({
        EmailCampaignRecipient.status: "failed",
        EmailCampaignRecipient.error: error,
        EmailCampaignRecipient.error_detail: note[:SMTP_ERROR_DETAIL_MAX],
    }, synchronize_session=False)
    db.commit()
    return stopped


def _ensure_unsubscribe_token(db, user: User) -> str:
    """The create route generates tokens up front; this is a defensive
    backstop so a send never goes out with a broken unsubscribe link."""
    if not user.unsubscribe_token:
        user.unsubscribe_token = secrets.token_urlsafe(32)
        db.commit()
    return user.unsubscribe_token


def _recount(db, campaign_id: str) -> Dict[str, int]:
    """Outcome counts from the recipient rows (the source of truth)."""
    rows = dict(
        db.query(EmailCampaignRecipient.status, func.count(EmailCampaignRecipient.id))
        .filter(EmailCampaignRecipient.campaign_id == campaign_id)
        .group_by(EmailCampaignRecipient.status).all()
    )
    return {
        "sent": rows.get("sent", 0),
        "failed": rows.get("failed", 0),
        "skipped": rows.get("skipped", 0),
        "pending": rows.get("pending", 0),
    }


def _finalize_campaign(db, campaign_id: str) -> None:
    """Set final status and heal the counters from the recipient rows (the
    source of truth), guarded on still owning the campaign."""
    counts = _recount(db, campaign_id)
    sent, failed, skipped = counts["sent"], counts["failed"], counts["skipped"]

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
        EmailCampaign.paused_until: None,
        EmailCampaign.updated_at: now,
        EmailCampaign.completed_at: now,
    }, synchronize_session=False)
    db.commit()
    logger.info(
        f"Campaign {campaign_id} finished: {final_status} "
        f"(sent={sent}, failed={failed}, skipped={skipped})"
    )


def reopen_for_retry(db, campaign_id: str) -> Optional[int]:
    """Put a finished campaign's retryable failures back in the queue.

    One transaction: the conditional UPDATE on the campaign is the claim (a
    second click, or a second admin, finds it 'pending' and gets None back);
    then the retryable failed rows go back to 'pending' and the counters are
    recounted. Returns how many recipients the job will now process (rows a
    crashed run left pending count too), or None if the campaign was not in a
    retryable state. Commits on success; rolls back when it returns None or 0.
    The caller starts the job.
    """
    now = datetime.utcnow()
    claimed = db.query(EmailCampaign).filter(
        EmailCampaign.id == campaign_id,
        EmailCampaign.status.in_(RETRYABLE_CAMPAIGN_STATUSES),
    ).update({
        EmailCampaign.status: "pending",
        EmailCampaign.completed_at: None,
        EmailCampaign.paused_until: None,
        EmailCampaign.updated_at: now,
    }, synchronize_session=False)
    if claimed == 0:
        db.rollback()
        return None

    db.query(EmailCampaignRecipient).filter(
        EmailCampaignRecipient.campaign_id == campaign_id,
        EmailCampaignRecipient.status == "failed",
        EmailCampaignRecipient.error.in_(RETRYABLE_RECIPIENT_ERRORS),
    ).update({
        EmailCampaignRecipient.status: "pending",
        EmailCampaignRecipient.error: None,
        EmailCampaignRecipient.error_detail: None,
        EmailCampaignRecipient.sent_at: None,
    }, synchronize_session=False)

    counts = _recount(db, campaign_id)
    if counts["pending"] == 0:
        db.rollback()
        return 0

    db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).update({
        EmailCampaign.sent_count: counts["sent"],
        EmailCampaign.failed_count: counts["failed"],
        EmailCampaign.skipped_count: counts["skipped"],
    }, synchronize_session=False)
    db.commit()
    return counts["pending"]
