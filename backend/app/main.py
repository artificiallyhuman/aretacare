from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.core.migrations import run_migrations
from app.api import api_router
from app.services.admin_service import admin_service
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

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

# Data Retention: Clean up old audit logs on startup
def run_audit_log_cleanup():
    """Run audit log cleanup for data retention."""
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

run_audit_log_cleanup()

# Data Retention: Clean up old error logs on startup
def run_error_log_cleanup():
    """Run error log cleanup for data retention."""
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

run_error_log_cleanup()

app = FastAPI(
    title="AretaCare API",
    description="Care. Clarity. Confidence. - Helping families navigate medical information",
    version="1.0.0",
)

# Configure GZip compression for responses (30-50% size reduction)
# minimum_size: Only compress responses larger than 1000 bytes
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api")


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
