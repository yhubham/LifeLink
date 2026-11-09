import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import or_, select

from app.core.security import decode_access_token, decode_ticket_token
from app.database.session import SessionLocal
from app.models import CallSession, CallStatus, Incident, User
from app.services.realtime import manager

router = APIRouter(tags=["realtime"])

# channel -> roles allowed to subscribe
CHANNEL_ROLES = {
    "admin": {"ADMIN", "POLICE", "RESCUE"},
    "ambulance": {"AMBULANCE", "ADMIN"},
    "hospital": {"HOSPITAL", "ADMIN"},
}

SIGNAL_TYPES = {"call.offer", "call.answer", "call.ice"}


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


@router.websocket("/ws/calls")
async def calls_socket(
    websocket: WebSocket,
    token: str | None = Query(default=None),
):
    """User-scoped signaling channel for SDP offers/answers and ICE candidates.

    The server validates that the sender is a participant of the call before
    relaying anything. SDP/ICE is never persisted.
    """
    user = _authenticate(token)
    if user is None:
        await websocket.close(code=1008, reason="Authentication required")
        return
    channel = f"user/{user.id}"
    await manager.connect(websocket, channel)
    try:
        while True:
            raw = await websocket.receive_text()
            if raw == "ping":
                continue
            if len(raw) > 200_000:
                continue
            try:
                message = json.loads(raw)
            except ValueError:
                continue
            event = message.get("type")
            if event not in SIGNAL_TYPES:
                continue
            try:
                call_id = uuid.UUID(str(message.get("call_id")))
            except (ValueError, TypeError):
                continue

            db = SessionLocal()
            try:
                call = db.get(CallSession, call_id)
                if call is None or user.id not in (call.caller_id, call.receiver_id):
                    continue
                if call.status not in (
                    CallStatus.CALLING,
                    CallStatus.RINGING,
                    CallStatus.CONNECTED,
                ):
                    continue
                target = (
                    call.receiver_id
                    if call.caller_id == user.id
                    else call.caller_id
                )
                manager.publish(
                    f"user/{target}",
                    event,
                    {
                        "call_id": str(call.id),
                        "incident_id": str(call.incident_id),
                        "from_user_id": str(user.id),
                        "from_name": user.full_name,
                        "payload": message.get("payload"),
                    },
                )
            finally:
                db.close()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, channel)
        _cleanup_user_calls(user.id)


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


@router.websocket("/ws/tickets/{incident_id}")
async def ticket_socket(
    websocket: WebSocket,
    incident_id: str,
    token: str | None = Query(default=None),
):
    """Public ticket updates, authorized by the signed ticket token."""
    if not token:
        await websocket.close(code=1008, reason="Ticket token required")
        return
    try:
        payload = decode_ticket_token(token)
        if payload["sub"] != incident_id:
            raise ValueError("Ticket mismatch")
        incident_uuid = uuid.UUID(incident_id)
    except Exception:  # noqa: BLE001
        await websocket.close(code=1008, reason="Invalid ticket token")
        return
    db = SessionLocal()
    try:
        incident = db.get(Incident, incident_uuid)
        if incident is None or incident.public_code != payload.get("code"):
            await websocket.close(code=1008, reason="Ticket not found")
            return
    finally:
        db.close()
    await _serve(websocket, f"tickets/{incident_id}")


def _cleanup_user_calls(user_id: uuid.UUID) -> None:
    """Best-effort cleanup when the signaling socket drops.

    Unanswered calls are failed so the caller does not ring forever. A
    connected call is left for the frontend to end explicitly, but the peer is
    told the signaling link is gone.
    """
    db = SessionLocal()
    try:
        calls = db.scalars(
            select(CallSession).where(
                or_(
                    CallSession.caller_id == user_id,
                    CallSession.receiver_id == user_id,
                ),
                CallSession.status.in_(
                    (CallStatus.CALLING, CallStatus.RINGING, CallStatus.CONNECTED)
                ),
            )
        ).all()
        for call in calls:
            peer_id = (
                call.receiver_id if call.caller_id == user_id else call.caller_id
            )
            if call.status in (CallStatus.CALLING, CallStatus.RINGING):
                call.status = CallStatus.FAILED
                call.ended_at = datetime.now(timezone.utc)
                call.end_reason = "signaling_disconnected"
                db.commit()
                manager.publish(
                    f"user/{peer_id}",
                    "call.failed",
                    {
                        "call_id": str(call.id),
                        "incident_id": str(call.incident_id),
                        "status": "FAILED",
                        "reason": "signaling_disconnected",
                    },
                )
            else:
                # A connected call cannot continue without the signaling link.
                # Close it so a stale row never blocks a future call.
                now = datetime.now(timezone.utc)
                call.status = CallStatus.ENDED
                call.ended_at = now
                call.end_reason = "signaling_disconnected"
                if call.connected_at is not None:
                    connected = call.connected_at
                    if connected.tzinfo is None:
                        connected = connected.replace(tzinfo=timezone.utc)
                    call.duration_seconds = max(
                        0, int((now - connected).total_seconds())
                    )
                db.commit()
                manager.publish(
                    f"user/{peer_id}",
                    "call.ended",
                    {
                        "call_id": str(call.id),
                        "incident_id": str(call.incident_id),
                        "status": "ENDED",
                        "reason": "signaling_disconnected",
                    },
                )
    finally:
        db.close()
