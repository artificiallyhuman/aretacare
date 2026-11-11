from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Name the driver explicitly: SQLAlchemy 2.1 maps a bare postgresql:// URL (what Render
# supplies) to psycopg 3, which isn't installed — the app ships psycopg2-binary.
DATABASE_URL = make_url(settings.DATABASE_URL).set(drivername="postgresql+psycopg2")

# Connection pooling.
#
# The pool is per process, and the service autoscales, so the number that matters is
#   (pool_size + max_overflow) x maximum instance count
# which must stay below the Postgres plan's connection limit with headroom for
# migrations, background-job sessions and admin access. The defaults (10 + 8 = 18 per
# instance, 90 across five instances) fit a 100-connection plan; raise them through the
# environment only together with the database plan, or put a pooler in front.
#
# pool_recycle: recycle connections after 1 hour to prevent stale connections
# pool_pre_ping: test connections before use to handle disconnects gracefully
# pool_timeout: seconds to wait for a free connection. Kept short: many routes are
#   async and check a connection out on the event loop, so a long wait here stalls
#   every other request on the instance.
# connect_timeout: maximum seconds to wait when establishing a new connection
# hide_parameters: keep bound parameter values (user content) out of SQL error
#   messages, which end up in logs and error reports.
engine = create_engine(
    DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=3600,
    pool_pre_ping=True,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    hide_parameters=True,
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
