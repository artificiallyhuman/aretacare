from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.core.migrations import run_migrations
from app.core.rate_limit import limiter, rate_limit_exceeded_handler, cleanup_rate_limit_storage
from app.core.security_headers import SecurityHeadersMiddleware
from app.core.sentry import init_sentry
from app.api import api_router
from app.services.admin_service import admin_service
import asyncio
import logging
import os
import sentry_sdk
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Suppress harmless passlib/bcrypt version warning
# (passlib 1.7.4 + bcrypt 4.x compatibility quirk - auth still works fine)
logging.getLogger("passlib.handlers.bcrypt").setLevel(logging.ERROR)

logger = logging.getLogger(__name__)

# Initialize Sentry before any database work so startup/migration crashes are
# captured. No-op when SENTRY_DSN is unset. Runs at module import, which is
# per-worker under uvicorn --workers N (same fork-safety reasoning as the
# engine.dispose() below).
init_sentry()

# Database initialization
reset_db = os.getenv("RESET_DB", "false").lower() == "true"

# Enable pgvector extension before create_all (required for Vector column type)
from sqlalchemy import text
with engine.connect() as _conn:
    try:
        _conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        _conn.commit()
    except Exception:
        _conn.rollback()

if reset_db:
    logger.warning("⚠️  RESET_DB is enabled - Dropping all tables and recreating schema")
    logger.warning("⚠️  This will delete ALL data in the database!")
    Base.metadata.drop_all(bind=engine)
    logger.info("✓ All tables dropped")
    Base.metadata.create_all(bind=engine)
    logger.info("✓ Database schema recreated")
else:
    # Normal startup - only create missing tables
    Base.metadata.create_all(bind=engine)
    logger.info("✓ Database tables initialized")
    # Run migrations for schema changes
    run_migrations()

def validate_startup():
    """Validate critical configuration at startup for fast failure."""
    errors = []
    warnings = []

    # OpenAI API key format check
    if not settings.OPENAI_API_KEY.startswith("sk-"):
        errors.append("OPENAI_API_KEY doesn't look valid (should start with 'sk-')")

    # AWS credentials basic length check
    if len(settings.AWS_ACCESS_KEY_ID) < 16:
        errors.append("AWS_ACCESS_KEY_ID appears too short (expected 16+ characters)")
    if len(settings.AWS_SECRET_ACCESS_KEY) < 20:
        errors.append("AWS_SECRET_ACCESS_KEY appears too short (expected 20+ characters)")

    # S3 bucket name format
    if not settings.S3_BUCKET_NAME or ' ' in settings.S3_BUCKET_NAME:
        errors.append("S3_BUCKET_NAME is empty or contains spaces")

    # SMTP partially configured warning
    if settings.SMTP_HOST and not settings.SMTP_PASSWORD:
        warnings.append(
            "SMTP_PASSWORD is empty — email notifications will fail. "
            "Set SMTP_PASSWORD or clear SMTP_HOST to suppress this warning."
        )

    # Push notifications partially configured warning
    if settings.PUSH_NOTIFICATIONS_ENABLED:
        missing_apns = []
        if not settings.APNS_KEY_PATH and not settings.APNS_KEY_CONTENT:
            missing_apns.append("APNS_KEY_PATH or APNS_KEY_CONTENT")
        if not settings.APNS_KEY_ID:
            missing_apns.append("APNS_KEY_ID")
        if not settings.APNS_TEAM_ID:
            missing_apns.append("APNS_TEAM_ID")
        if missing_apns:
            errors.append(
                f"PUSH_NOTIFICATIONS_ENABLED is True but {', '.join(missing_apns)} "
                "not set. Either configure APNs or set PUSH_NOTIFICATIONS_ENABLED=False."
            )

    # DEBUG mode warning (HSTS disabled)
    if settings.DEBUG:
        warnings.append("DEBUG mode is enabled — HSTS header will not be sent")

    # Database connectivity
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        errors.append(f"Database connection failed: {e}")

    for w in warnings:
        logger.warning(f"CONFIG WARNING: {w}")

    if errors:
        for e in errors:
            logger.error(f"CONFIG ERROR: {e}")
        raise SystemExit(
            f"Startup aborted: {len(errors)} configuration error(s). "
            "Check logs above for details."
        )

    logger.info("✓ Configuration validated")


validate_startup()

# Dispose connection pool before workers fork.
# Module-level code above (migrations, validation) creates DB connections that
# get cached in the pool. With --workers N, uvicorn forks child processes that
# inherit these connections. libpq connections aren't fork-safe — reusing them
# in child workers causes segfaults (exit code 139). Disposing forces each
# worker to create fresh connections after fork.
engine.dispose()

app = FastAPI(
    title="AretaCare API",
    description="Calm. Clarity. Confidence. - Helping families navigate medical information",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Configure rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# Pydantic / FastAPI validation errors default to HTTP 422 with `detail` as a list
# of error objects. The web and iOS clients display `detail` as a string in most
# error paths and would crash (React: "Objects are not valid as a React child")
# if handed an array. This handler flattens validation errors into a single
# human-readable string and returns HTTP 400 — matching the shape every other
# error handler in this app uses.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        # Combine field-name + message into "name: Name may only contain letters…"
        parts = []
        for err in errors:
            loc = err.get("loc", [])
            field = loc[-1] if loc else "field"
            msg = err.get("msg", "Invalid input")
            # Strip the Pydantic "Value error, " / "String should..." prefix noise
            if msg.startswith("Value error, "):
                msg = msg[len("Value error, "):]
            parts.append(f"{field}: {msg}" if field else msg)
        detail = "; ".join(parts)
    else:
        detail = "Invalid request payload."

    return JSONResponse(
        status_code=400,
        content={"detail": detail},
    )

# Configure GZip compression for responses (30-50% size reduction)
# minimum_size: Only compress responses larger than 1000 bytes
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure CORS with explicit methods and headers (security best practice)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "X-MFA-Action-Token",
        "X-Client-Type",
        "X-Trusted-Device",
    ],
)

# Add security headers to all responses
app.add_middleware(SecurityHeadersMiddleware)

# Include API routes
app.include_router(api_router, prefix="/api")


# Global exception handler for unhandled errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all handler for unhandled exceptions.
    Logs the full traceback and returns a generic error to avoid leaking internals.
    """
    # Log the full error with traceback for debugging
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
    logger.error(traceback.format_exc())

    # A registered Exception handler suppresses the Sentry FastAPI
    # integration's automatic capture, so capture explicitly. No-op when
    # Sentry is disabled; the Dedupe integration prevents double-send if a
    # future SDK version also auto-captures.
    sentry_sdk.capture_exception(exc)

    # Log to the error_logs table for the admin console
    try:
        from app.services.error_logger import log_error_standalone
        from app.services.security_service import security_service

        log_error_standalone(
            source=f"{request.method} {request.url.path}",
            error=exc,
            level="ERROR",
            details={
                "endpoint": str(request.url.path),
                "method": request.method,
                "ip_address": security_service.get_client_ip(request),
                "user_agent": security_service.get_user_agent(request),
            },
        )
    except Exception as log_error:
        logger.error(f"Failed to log error to database: {log_error}")

    # Return generic error - never expose internal details
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal error occurred. Please try again later.",
            "error_code": "INTERNAL_ERROR"
        }
    )


# Data Retention: Clean up old logs on startup (after models are initialized)
@app.on_event("startup")
async def startup_cleanup():
    """Run data retention cleanup on startup using a single database session.
    Wrapped with a 60-second timeout to prevent indefinite startup hangs."""
    try:
        await asyncio.wait_for(_run_startup_cleanup(), timeout=60)
    except asyncio.TimeoutError:
        logger.warning("Startup cleanup timed out after 60s — continuing with startup")


async def _run_startup_cleanup():
    from datetime import datetime, timedelta
    from sqlalchemy import or_
    from app.models.error_log import ErrorLog
    from app.models.api_log import ApiLog
    from app.models.security_log import SecurityLog
    from app.models.pending_invitation import PendingInvitation
    from app.models.refresh_token import RefreshToken
    from app.services.admin_report_service import admin_report_service
    from app.services.mfa_service import MFAService

    db = SessionLocal()
    now = datetime.utcnow()

    try:
        # Audit logs
        try:
            deleted = admin_service.cleanup_old_audit_logs(db)
            logger.info(f"✓ Audit log cleanup: {deleted or 'No'} entries removed (retention: {settings.AUDIT_LOG_RETENTION_DAYS} days)")
        except Exception as e:
            logger.error(f"Audit log cleanup failed: {e}")
            db.rollback()

        # Error logs
        try:
            cutoff = now - timedelta(days=settings.ERROR_LOG_RETENTION_DAYS)
            deleted = db.query(ErrorLog).filter(ErrorLog.timestamp < cutoff).delete()
            db.commit()
            logger.info(f"✓ Error log cleanup: {deleted or 'No'} entries removed (retention: {settings.ERROR_LOG_RETENTION_DAYS} days)")
        except Exception as e:
            logger.error(f"Error log cleanup failed: {e}")
            db.rollback()

        # API logs
        try:
            cutoff = now - timedelta(days=settings.API_LOG_RETENTION_DAYS)
            deleted = db.query(ApiLog).filter(ApiLog.created_at < cutoff).delete()
            db.commit()
            logger.info(f"✓ API log cleanup: {deleted or 'No'} entries removed (retention: {settings.API_LOG_RETENTION_DAYS} days)")
        except Exception as e:
            logger.error(f"API log cleanup failed: {e}")
            db.rollback()

        # Security logs
        try:
            cutoff = now - timedelta(days=settings.SECURITY_LOG_RETENTION_DAYS)
            deleted = db.query(SecurityLog).filter(SecurityLog.created_at < cutoff).delete()
            db.commit()
            logger.info(f"✓ Security log cleanup: {deleted or 'No'} entries removed (retention: {settings.SECURITY_LOG_RETENTION_DAYS} days)")
        except Exception as e:
            logger.error(f"Security log cleanup failed: {e}")
            db.rollback()

        # Expired invitations (30 days)
        try:
            cutoff = now - timedelta(days=30)
            deleted = db.query(PendingInvitation).filter(PendingInvitation.created_at < cutoff).delete()
            db.commit()
            logger.info(f"✓ Invitation cleanup: {deleted or 'No'} expired invitations removed")
        except Exception as e:
            logger.error(f"Invitation cleanup failed: {e}")
            db.rollback()

        # Refresh tokens (expired or revoked >7 days ago)
        try:
            revoked_cutoff = now - timedelta(days=7)
            deleted = db.query(RefreshToken).filter(
                or_(
                    RefreshToken.expires_at < now,
                    (RefreshToken.is_revoked == True) & (RefreshToken.revoked_at < revoked_cutoff)
                )
            ).delete(synchronize_session=False)
            db.commit()
            logger.info(f"✓ Refresh token cleanup: {deleted or 'No'} tokens removed")
        except Exception as e:
            logger.error(f"Refresh token cleanup failed: {e}")
            db.rollback()

        # Admin reports
        try:
            deleted = admin_report_service.cleanup_old_reports(db)
            logger.info(f"✓ Admin report cleanup: {deleted or 'No'} reports removed (retention: {settings.ADMIN_REPORT_RETENTION_DAYS} days)")
        except Exception as e:
            logger.error(f"Admin report cleanup failed: {e}")
            db.rollback()

        # MFA challenges
        try:
            deleted = MFAService.cleanup_expired_challenges(db)
            logger.info(f"✓ MFA challenge cleanup: {deleted or 'No'} challenges removed")
        except Exception as e:
            logger.error(f"MFA challenge cleanup failed: {e}")
            db.rollback()

        # Trusted devices
        try:
            deleted = MFAService.cleanup_expired_devices(db)
            logger.info(f"✓ Trusted device cleanup: {deleted or 'No'} devices removed")
        except Exception as e:
            logger.error(f"Trusted device cleanup failed: {e}")
            db.rollback()

    finally:
        db.close()


# Periodic background task to evict expired rate-limit entries from memory
_rate_limit_cleanup_task = None

async def _periodic_rate_limit_cleanup():
    """Run rate limit storage cleanup every hour."""
    while True:
        await asyncio.sleep(3600)  # 1 hour
        cleanup_rate_limit_storage()

@app.on_event("startup")
async def start_periodic_tasks():
    global _rate_limit_cleanup_task
    _rate_limit_cleanup_task = asyncio.create_task(_periodic_rate_limit_cleanup())

@app.on_event("shutdown")
async def stop_periodic_tasks():
    if _rate_limit_cleanup_task:
        _rate_limit_cleanup_task.cancel()


@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    """Root endpoint (supports HEAD for health probes)"""
    payload = {
        "message": "Welcome to AretaCare API",
        "description": "Calm. Clarity. Confidence.",
        "version": "1.0.0",
    }
    # Interactive docs are disabled unless DEBUG is set, so only advertise the path
    # when it actually resolves.
    if settings.DEBUG:
        payload["docs"] = "/docs"
    return payload


@app.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt():
    return (
        "User-agent: *\n"
        "Disallow: /\n"
    )


@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    """Health check endpoint (supports HEAD for health probes)"""
    return {
        "status": "healthy",
        "service": "AretaCare API"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
