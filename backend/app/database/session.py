from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings


def _engine_kwargs(url: str) -> dict:
    if not url.startswith("sqlite"):
        # Fail fast instead of hanging a serverless invocation when the database
        # host is unreachable (for example, the default localhost URL on Vercel).
        # Neon's pooled endpoint runs PgBouncer in transaction mode, so
        # server-side prepared statements must stay disabled.
        return {
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "connect_args": {"connect_timeout": 5, "prepare_threshold": None},
        }
    # Test runs use an in-memory SQLite database shared across threads.
    kwargs: dict = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in url:
        kwargs["poolclass"] = StaticPool
    return kwargs


engine = create_engine(settings.DATABASE_URL, **_engine_kwargs(settings.DATABASE_URL))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_target() -> str:
    """Describe the configured database without exposing its credentials."""
    try:
        url = make_url(settings.DATABASE_URL)
    except Exception:
        return "unparseable DATABASE_URL"
    host = url.host or "local"
    port = f":{url.port}" if url.port else ""
    return f"{url.drivername}://{host}{port}/{url.database or ''}"


def database_probe() -> dict:
    """Check that the database answers a trivial query.

    Never raises: the health endpoint must stay useful (and must not turn a
    configuration problem into another FUNCTION_INVOCATION_FAILED).
    """
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"state": "connected", "error": None}
    except Exception as exc:  # noqa: BLE001 - report any driver/network failure
        return {"state": "unavailable", "error": describe_database_error(exc)}


def describe_database_error(exc: BaseException) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    # Never echo a password from a connection URL embedded in a driver error.
    import re

    message = re.sub(r"(://[^:/@\s]+:)[^@\s]+@", r"\1***@", message)
    return f"{exc.__class__.__name__}: {message[:400]}"


def create_schema() -> dict:
    """Create missing tables. Returns the same shape as ``database_probe``."""
    try:
        Base.metadata.create_all(bind=engine)
        return {"state": "connected", "error": None}
    except Exception as exc:  # noqa: BLE001 - startup must not kill the function
        return {"state": "unavailable", "error": describe_database_error(exc)}
