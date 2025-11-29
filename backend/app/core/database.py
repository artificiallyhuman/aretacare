from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Configure connection pooling for better performance under load
# pool_size: Number of connections to keep open (default was 5)
# max_overflow: Additional connections allowed above pool_size during peak load
# pool_recycle: Recycle connections after 1 hour to prevent stale connections
# pool_pre_ping: Test connections before use to handle disconnects gracefully
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Database dependency for FastAPI routes"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
