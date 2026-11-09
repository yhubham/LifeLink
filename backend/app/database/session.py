from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings


def _engine_kwargs(url: str) -> dict:
    if not url.startswith("sqlite"):
        return {"pool_pre_ping": True}
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
