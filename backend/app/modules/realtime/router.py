import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.database.session import SessionLocal
from app.models import User
from app.services.realtime import manager

router = APIRouter(tags=["realtime"])

# channel -> roles allowed to subscribe
CHANNEL_ROLES = {
    "admin": {"ADMIN", "POLICE", "RESCUE"},
    "ambulance": {"AMBULANCE", "ADMIN"},
    "hospital": {"HOSPITAL", "ADMIN"},
}


def _authenticate(token: str | None) -> User | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except Exception:  # noqa: BLE001 - any malformed token is unauthenticated
        return None
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        return user if user is not None and user.is_active else None
    finally:
        db.close()


async def _serve(websocket: WebSocket, channel: str) -> None:
    await manager.connect(websocket, channel)
    try:
        while True:
            # Clients send periodic "ping" text; any traffic keeps the socket alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, channel)


@router.websocket("/ws/{channel}")
async def channel_socket(
    websocket: WebSocket,
    channel: str,
    token: str | None = Query(default=None),
):
    allowed = CHANNEL_ROLES.get(channel)
    user = _authenticate(token)
    if allowed is None or user is None or user.role.value not in allowed:
        await websocket.close(code=1008, reason="Unauthorized channel")
        return
    await _serve(websocket, channel)


@router.websocket("/ws/incidents/{incident_id}")
async def incident_socket(
    websocket: WebSocket,
    incident_id: str,
    token: str | None = Query(default=None),
):
    user = _authenticate(token)
    if user is None:
        await websocket.close(code=1008, reason="Authentication required")
        return
    await _serve(websocket, f"incidents/{incident_id}")
