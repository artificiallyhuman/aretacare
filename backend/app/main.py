from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.core.migrations import run_migrations
from app.core.rate_limit import limiter, rate_limit_exceeded_handler, cleanup_rate_limit_storage
from app.core.security_headers import SecurityHeadersMiddleware
from app.api import api_router
from app.services.admin_service import admin_service
import asyncio
import logging
import os
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

app = FastAPI(
    title="AretaCare API",
    description="Calm. Clarity. Confidence. - Helping families navigate medical information",
    version="1.0.0",
)

# Configure rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

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

    # Try to log to database error_log table
    try:
        from app.models.error_log import ErrorLog
        from app.services.security_service import security_service

        db = SessionLocal()
        error_log = ErrorLog(
            error_type=type(exc).__name__,
            error_message=str(exc)[:1000],
            stack_trace=traceback.format_exc()[:4000],
            endpoint=str(request.url.path),
            method=request.method,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request)
        )
        db.add(error_log)
        db.commit()
        db.close()
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
    """Run data retention cleanup on startup using a single database session"""
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
    return {
        "message": "Welcome to AretaCare API",
        "description": "Calm. Clarity. Confidence.",
        "version": "1.0.0",
        "docs": "/docs"
    }


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
