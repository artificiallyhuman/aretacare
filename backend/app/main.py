from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api import api_router
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

app = FastAPI(
    title="AretaCare API",
    description="AI Care Advocate Assistant - Helping families navigate medical information",
    version="1.0.0",
)

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
        "description": "Your Family's AI Care Advocate",
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
