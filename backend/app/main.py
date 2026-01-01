from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.core.migrations import run_migrations
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.core.security_headers import SecurityHeadersMiddleware
from app.api import api_router
from app.services.admin_service import admin_service
import logging
import os

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

app = FastAPI(
    title="AretaCare API",
    description="Care. Clarity. Confidence. - Helping families navigate medical information",
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


# Data Retention: Clean up old logs on startup (after models are initialized)
@app.on_event("startup")
async def startup_cleanup():
    """Run data retention cleanup on startup"""
    # Clean up old audit logs
    try:
        db = SessionLocal()
        deleted_count = admin_service.cleanup_old_audit_logs(db)
        if deleted_count > 0:
            logger.info(f"✓ Audit log cleanup: {deleted_count} old entries removed")
        else:
            logger.info(f"✓ Audit log cleanup: No old entries to remove (retention: {settings.AUDIT_LOG_RETENTION_DAYS} days)")
        db.close()
    except Exception as e:
        logger.error(f"Failed to run audit log cleanup: {e}")

    # Clean up old error logs
    try:
        from app.models.error_log import ErrorLog
        from datetime import datetime, timedelta

        db = SessionLocal()
        cutoff_date = datetime.utcnow() - timedelta(days=settings.ERROR_LOG_RETENTION_DAYS)
        deleted_count = db.query(ErrorLog).filter(ErrorLog.timestamp < cutoff_date).delete()
        db.commit()

        if deleted_count > 0:
            logger.info(f"✓ Error log cleanup: {deleted_count} old entries removed")
        else:
            logger.info(f"✓ Error log cleanup: No old entries to remove (retention: {settings.ERROR_LOG_RETENTION_DAYS} days)")
        db.close()
    except Exception as e:
        logger.error(f"Failed to run error log cleanup: {e}")

    # Clean up old API logs
    try:
        from app.models.api_log import ApiLog
        from datetime import datetime, timedelta

        db = SessionLocal()
        cutoff_date = datetime.utcnow() - timedelta(days=settings.API_LOG_RETENTION_DAYS)
        deleted_count = db.query(ApiLog).filter(ApiLog.created_at < cutoff_date).delete()
        db.commit()

        if deleted_count > 0:
            logger.info(f"✓ API log cleanup: {deleted_count} old entries removed")
        else:
            logger.info(f"✓ API log cleanup: No old entries to remove (retention: {settings.API_LOG_RETENTION_DAYS} days)")
        db.close()
    except Exception as e:
        logger.error(f"Failed to run API log cleanup: {e}")

    # Clean up old security logs
    try:
        from app.models.security_log import SecurityLog
        from datetime import datetime, timedelta

        db = SessionLocal()
        cutoff_date = datetime.utcnow() - timedelta(days=settings.SECURITY_LOG_RETENTION_DAYS)
        deleted_count = db.query(SecurityLog).filter(SecurityLog.created_at < cutoff_date).delete()
        db.commit()

        if deleted_count > 0:
            logger.info(f"✓ Security log cleanup: {deleted_count} old entries removed")
        else:
            logger.info(f"✓ Security log cleanup: No old entries to remove (retention: {settings.SECURITY_LOG_RETENTION_DAYS} days)")
        db.close()
    except Exception as e:
        logger.error(f"Failed to run security log cleanup: {e}")

    # Clean up expired invitations (older than 30 days)
    try:
        from app.models.pending_invitation import PendingInvitation
        from datetime import datetime, timedelta

        db = SessionLocal()
        cutoff_date = datetime.utcnow() - timedelta(days=30)
        deleted_count = db.query(PendingInvitation).filter(PendingInvitation.created_at < cutoff_date).delete()
        db.commit()

        if deleted_count > 0:
            logger.info(f"✓ Invitation cleanup: {deleted_count} expired invitations removed")
        else:
            logger.info(f"✓ Invitation cleanup: No expired invitations to remove (retention: 30 days)")
        db.close()
    except Exception as e:
        logger.error(f"Failed to run invitation cleanup: {e}")

    # Clean up old refresh tokens (expired or revoked more than 7 days ago)
    try:
        from app.models.refresh_token import RefreshToken
        from datetime import datetime, timedelta
        from sqlalchemy import or_

        db = SessionLocal()
        now = datetime.utcnow()
        revoked_cutoff = now - timedelta(days=7)  # Keep revoked tokens for 7 days for auditing

        # Delete tokens that are:
        # 1. Expired (expires_at < now), OR
        # 2. Revoked more than 7 days ago
        deleted_count = db.query(RefreshToken).filter(
            or_(
                RefreshToken.expires_at < now,
                (RefreshToken.is_revoked == True) & (RefreshToken.revoked_at < revoked_cutoff)
            )
        ).delete(synchronize_session=False)
        db.commit()

        if deleted_count > 0:
            logger.info(f"✓ Refresh token cleanup: {deleted_count} expired/revoked tokens removed")
        else:
            logger.info(f"✓ Refresh token cleanup: No old tokens to remove")
        db.close()
    except Exception as e:
        logger.error(f"Failed to run refresh token cleanup: {e}")

    # Clean up old admin reports
    try:
        from app.services.admin_report_service import admin_report_service

        db = SessionLocal()
        deleted_count = admin_report_service.cleanup_old_reports(db)
        if deleted_count > 0:
            logger.info(f"✓ Admin report cleanup: {deleted_count} old reports removed")
        else:
            logger.info(f"✓ Admin report cleanup: No old reports to remove (retention: {settings.ADMIN_REPORT_RETENTION_DAYS} days)")
        db.close()
    except Exception as e:
        logger.error(f"Failed to run admin report cleanup: {e}")

    # Clean up expired MFA challenges and trusted devices
    try:
        from app.services.mfa_service import MFAService

        db = SessionLocal()

        # Clean up expired MFA challenges
        challenges_deleted = MFAService.cleanup_expired_challenges(db)
        if challenges_deleted > 0:
            logger.info(f"✓ MFA challenge cleanup: {challenges_deleted} expired challenges removed")
        else:
            logger.info("✓ MFA challenge cleanup: No expired challenges to remove")

        # Clean up expired trusted devices
        devices_deleted = MFAService.cleanup_expired_devices(db)
        if devices_deleted > 0:
            logger.info(f"✓ Trusted device cleanup: {devices_deleted} expired devices removed")
        else:
            logger.info("✓ Trusted device cleanup: No expired devices to remove")

        db.close()
    except Exception as e:
        logger.error(f"Failed to run MFA cleanup: {e}")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to AretaCare API",
        "description": "Care. Clarity. Confidence.",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
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
