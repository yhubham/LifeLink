from fastapi import APIRouter

from app.modules.ambulances.router import router as ambulances_router
from app.modules.auth.router import router as auth_router
from app.modules.calls.router import router as calls_router
from app.modules.first_aid.router import router as first_aid_router
from app.modules.hospitals.router import router as hospitals_router
from app.modules.incidents.router import router as incidents_router
from app.modules.realtime.router import router as realtime_router
from app.modules.triage.router import router as triage_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(incidents_router)
api_router.include_router(triage_router)
api_router.include_router(first_aid_router)
api_router.include_router(ambulances_router)
api_router.include_router(hospitals_router)
api_router.include_router(calls_router)
api_router.include_router(realtime_router)
