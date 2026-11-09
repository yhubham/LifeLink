from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.first_aid.router import router as first_aid_router
from app.modules.incidents.router import router as incidents_router
from app.modules.triage.router import router as triage_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(incidents_router)
api_router.include_router(triage_router)
api_router.include_router(first_aid_router)
