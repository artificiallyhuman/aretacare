from fastapi import APIRouter
from sqlalchemy import text
from app.core.database import SessionLocal
from app.services.s3_service import s3_service
from app.services.openai_service import openai_circuit_breaker
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    """Simple health check endpoint for load balancers"""
    return {
        "status": "healthy",
        "service": "AretaCare API",
        "message": "System operational"
    }


@router.get("/detailed")
async def detailed_health_check():
    """
    Comprehensive health check that tests connectivity to all dependencies.
    Use this for monitoring systems that need to verify full system health.
    """
    checks = {
        "database": {"status": "unknown", "latency_ms": None},
        "s3": {"status": "unknown", "latency_ms": None},
    }
    overall_healthy = True

    # Check database connectivity
    import time
    try:
        start = time.time()
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        latency = round((time.time() - start) * 1000, 2)
        checks["database"] = {"status": "healthy", "latency_ms": latency}
    except Exception as e:
        logger.error(f"Health check - Database error: {e}")
        # Expose only the exception class — full message may contain internal
        # hostnames/credentials and this endpoint is unauthenticated
        checks["database"] = {"status": "unhealthy", "error": type(e).__name__}
        overall_healthy = False

    # Check S3 connectivity (list bucket to verify credentials and access)
    try:
        start = time.time()
        # Use head_bucket to verify connectivity without listing objects
        s3_service._get_sync_client().head_bucket(Bucket=s3_service.bucket_name)
        latency = round((time.time() - start) * 1000, 2)
        checks["s3"] = {"status": "healthy", "latency_ms": latency}
    except Exception as e:
        logger.error(f"Health check - S3 error: {e}")
        checks["s3"] = {"status": "unhealthy", "error": type(e).__name__}
        overall_healthy = False

    # Check OpenAI circuit breaker status
    cb_status = openai_circuit_breaker.get_status()
    checks["openai_circuit_breaker"] = {
        "status": "open" if cb_status["is_open"] else "closed",
        "failure_count": cb_status["failure_count"],
        "threshold": cb_status["threshold"],
        "cooldown_remaining_seconds": cb_status["cooldown_remaining_seconds"]
    }
    # Circuit breaker being open is a warning, not a failure (system is protecting itself)
    if cb_status["is_open"]:
        overall_healthy = False  # Mark as degraded when circuit is open

    return {
        "status": "healthy" if overall_healthy else "degraded",
        "service": "AretaCare API",
        "checks": checks
    }
