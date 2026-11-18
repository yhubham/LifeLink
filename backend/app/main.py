import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.api import api_router
from app.core.config import settings
from app.database.session import (
    create_schema,
    database_probe,
    database_target,
    describe_database_error,
)
from app.models import Base  # noqa: F401  (registers all tables)
from app.services.realtime import manager

logger = logging.getLogger("lifelink")

# Captured during startup so the health endpoint can explain what happened.
_startup_database = {"state": "not-checked", "error": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (demo convenience; Alembic takes over later).
    # A missing or unreachable database must not kill the whole function: that
    # turns every route, including /api/v1/health, into FUNCTION_INVOCATION_FAILED.
    global _startup_database
    _startup_database = create_schema()
    if _startup_database["state"] == "connected":
        logger.info("Database ready at %s", database_target())
    else:
        logger.error(
            "Database unavailable at %s -> %s",
            database_target(),
            _startup_database["error"],
        )

    try:
        manager.bind_loop()
    except Exception:  # noqa: BLE001 - realtime is optional for health/reporting
        logger.exception("Realtime manager could not bind the event loop")

    yield


app = FastAPI(
    title=settings.APP_NAME + " API",
    description="Emergency response and coordination platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request: Request, exc: SQLAlchemyError):
    """Return JSON, not an opaque platform 500, when the database fails."""
    logger.exception("Database error while handling %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=503,
        content={
            "detail": (
                "The database is unavailable. Check the DATABASE_URL configured "
                "for this deployment."
            ),
            "database": database_target(),
            "error": describe_database_error(exc),
        },
    )


@app.get("/")
def root():
    return {"message": "Welcome to LifeLink API", "status": "running"}


@app.get("/api/v1/health")
def health():
    probe = database_probe()
    return {
        "status": "healthy",
        "application": settings.APP_NAME,
        "database": probe["state"],
        "database_target": database_target(),
        "startup_database": _startup_database["state"],
        "database_error": probe["error"] or _startup_database["error"],
    }
