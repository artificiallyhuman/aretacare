from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Name the driver explicitly: SQLAlchemy 2.1 maps a bare postgresql:// URL (what Render
# supplies) to psycopg 3, which isn't installed — the app ships psycopg2-binary.
DATABASE_URL = make_url(settings.DATABASE_URL).set(drivername="postgresql+psycopg2")

# Configure connection pooling for better performance under load
# pool_size: Number of connections to keep open (default was 5)
# max_overflow: Additional connections allowed above pool_size during peak load
# pool_recycle: Recycle connections after 1 hour to prevent stale connections
# pool_pre_ping: Test connections before use to handle disconnects gracefully
# pool_timeout: Maximum seconds to wait for a connection from pool (prevents hanging)
# connect_timeout: Maximum seconds to wait when establishing a new connection
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    pool_pre_ping=True,
    pool_timeout=30,
    connect_args={"connect_timeout": 10},
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
