from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.database.session import engine
from app.models import Base  # noqa: F401  (registers all tables)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (demo convenience; Alembic takes over later)
    Base.metadata.create_all(bind=engine)
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


@app.get("/")
def root():
    return {"message": "Welcome to LifeLink API", "status": "running"}


@app.get("/api/v1/health")
def health():
    return {"status": "healthy", "application": settings.APP_NAME}
