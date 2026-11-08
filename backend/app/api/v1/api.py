from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.incidents.router import router as incidents_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(incidents_router)
