import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select

from app.api.deps import DbDep, require_roles
from app.core.security import turn_ice_servers
from app.models import (
    Ambulance,
    AmbulanceAssignment,
    AssignmentStatus,
    CallParticipant,
    CallSession,
    CallStatus,
    Incident,
    User,
    UserRole,
)
from app.schemas.call import (
    CallActor,
    CallCreate,
    CallFailRequest,
    CallOut,
    IceConfigOut,
)
from app.services.incident_events import add_event
from app.services.realtime import publish

router = APIRouter(tags=["calls"])

CONTROL_ROLES = {UserRole.ADMIN, UserRole.POLICE, UserRole.RESCUE}
ACTIVE_CALL = (CallStatus.CALLING, CallStatus.RINGING, CallStatus.CONNECTED)
ACTIVE_ASSIGNMENT = (
    AssignmentStatus.ASSIGNED,
    AssignmentStatus.ACCEPTED,
    AssignmentStatus.EN_ROUTE,
    AssignmentStatus.ARRIVED,
)


def _actor(user: User) -> CallActor:
    return CallActor(id=user.id, full_name=user.full_name, role=user.role.value)


def _call_out(db, call: CallSession) -> CallOut:
    caller = db.get(User, call.caller_id)
    receiver = db.get(User, call.receiver_id)
    incident = db.get(Incident, call.incident_id)
    if caller is None or receiver is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Call participants no longer exist",
        )
    return CallOut(
        id=call.id,
        incident_id=call.incident_id,
        public_code=incident.public_code if incident else None,
        room=call.room,
        status=call.status,
        caller=_actor(caller),
        receiver=_actor(receiver),
        started_at=call.started_at,
        connected_at=call.connected_at,
        ended_at=call.ended_at,
        duration_seconds=call.duration_seconds,
        end_reason=call.end_reason,
    )


def _call_payload(call: CallSession) -> dict:
    return {
        "call_id": str(call.id),
        "incident_id": str(call.incident_id),
        "room": call.room,
        "status": call.status.value,
        "caller_id": str(call.caller_id),
        "receiver_id": str(call.receiver_id),
    }


def _get_call(db, call_id: uuid.UUID) -> CallSession:
    call = db.get(CallSession, call_id)
    if call is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Call not found"
        )
    return call


def _require_participant(call: CallSession, user: User) -> None:
    if user.id not in (call.caller_id, call.receiver_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this call",
        )


def _active_assignment(db, incident_id: uuid.UUID) -> AmbulanceAssignment | None:
    return db.scalar(
        select(AmbulanceAssignment)
        .where(
            AmbulanceAssignment.incident_id == incident_id,
            AmbulanceAssignment.assignment_status.in_(ACTIVE_ASSIGNMENT),
        )
        .order_by(AmbulanceAssignment.assigned_at.desc())
    )


def _publish_call(event: str, target_user_id: uuid.UUID, call: CallSession) -> None:
    publish(f"user/{target_user_id}", event, _call_payload(call))


@router.get("/calls/ice-config", response_model=IceConfigOut)
def ice_config(user: User = Depends(require_roles(*[r.value for r in UserRole]))):
    """ICE servers for the authenticated browser (STUN + optional TURN)."""
    return IceConfigOut(ice_servers=turn_ice_servers(str(user.id)))


@router.post("/calls", response_model=CallOut, status_code=201)
def create_call(
    body: CallCreate,
    db: DbDep,
    user: User = Depends(
        require_roles(
            UserRole.ADMIN.value,
            UserRole.POLICE.value,
            UserRole.RESCUE.value,
            UserRole.AMBULANCE.value,
        )
    ),
):
    incident = db.get(Incident, body.incident_id)
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )
    assignment = _active_assignment(db, incident.id)
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active ambulance assignment for this incident",
        )
    ambulance = db.get(Ambulance, assignment.ambulance_id)
    if ambulance is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Assigned ambulance is missing"
        )

    existing = db.scalar(
        select(CallSession).where(
            CallSession.incident_id == incident.id,
            CallSession.status.in_(ACTIVE_CALL),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active call already exists for this incident",
        )

    if user.role in CONTROL_ROLES:
        if ambulance.crew_user_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The assigned ambulance has no linked crew account to call",
            )
        receiver = db.get(User, ambulance.crew_user_id)
        if receiver is None or not receiver.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The assigned crew account is not available",
            )
        if body.receiver_id is not None and body.receiver_id != receiver.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only call the crew assigned to this incident",
            )
    else:
        if ambulance.crew_user_id not in (None, user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not the crew assigned to this incident",
            )
        if body.receiver_id is not None:
            receiver = db.get(User, body.receiver_id)
        else:
            receiver = db.scalar(
                select(User)
                .where(User.role.in_(list(CONTROL_ROLES)), User.is_active.is_(True))
                .order_by(User.created_at)
            )
        if receiver is None or not receiver.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No control-room operator is available to receive the call",
            )
        if receiver.role not in CONTROL_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Responders can only call the control room",
            )

    if receiver.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot call yourself",
        )

    call = CallSession(
        id=uuid.uuid4(),
        incident_id=incident.id,
        caller_id=user.id,
        receiver_id=receiver.id,
        room=uuid.uuid4().hex,
        status=CallStatus.RINGING,
        ringing_at=datetime.now(timezone.utc),
    )
    db.add(call)
    db.add_all(
        [
            CallParticipant(
                id=uuid.uuid4(),
                call_id=call.id,
                user_id=user.id,
                role="caller",
            ),
            CallParticipant(
                id=uuid.uuid4(),
                call_id=call.id,
                user_id=receiver.id,
                role="receiver",
            ),
        ]
    )
    add_event(
        db,
        incident.id,
        "call_started",
        f"Voice call started with {receiver.full_name}",
        actor_id=user.id,
    )
    db.commit()
    db.refresh(call)
    _publish_call("call.invite", receiver.id, call)
    return _call_out(db, call)


@router.get("/calls/active", response_model=list[CallOut])
def active_calls(
    db: DbDep,
    user: User = Depends(require_roles(*[r.value for r in UserRole])),
):
    calls = db.scalars(
        select(CallSession)
        .where(
            or_(
                CallSession.caller_id == user.id,
                CallSession.receiver_id == user.id,
            ),
            CallSession.status.in_(ACTIVE_CALL),
        )
        .order_by(CallSession.started_at.desc())
    ).all()
    return [_call_out(db, call) for call in calls]


@router.get("/calls/history", response_model=list[CallOut])
def call_history(
    db: DbDep,
    incident_id: uuid.UUID | None = None,
    user: User = Depends(require_roles(*[r.value for r in UserRole])),
):
    stmt = select(CallSession).order_by(CallSession.started_at.desc())
    if incident_id is not None:
        stmt = stmt.where(CallSession.incident_id == incident_id)
    if user.role == UserRole.AMBULANCE:
        stmt = stmt.where(CallSession.receiver_id == user.id)
    calls = db.scalars(stmt.limit(100)).all()
    return [_call_out(db, call) for call in calls]


@router.get("/calls/{call_id}", response_model=CallOut)
def get_call(
    call_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles(*[r.value for r in UserRole])),
):
    call = _get_call(db, call_id)
    _require_participant(call, user)
    return _call_out(db, call)


@router.post("/calls/{call_id}/accept", response_model=CallOut)
def accept_call(
    call_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles(*[r.value for r in UserRole])),
):
    call = _get_call(db, call_id)
    if call.receiver_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the called participant can accept",
        )
    if call.status not in (CallStatus.CALLING, CallStatus.RINGING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Call is {call.status.value}",
        )
    call.status = CallStatus.CONNECTED
    call.connected_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(call)
    _publish_call("call.accepted", call.caller_id, call)
    _publish_call("call.accepted", call.receiver_id, call)
    return _call_out(db, call)


@router.post("/calls/{call_id}/reject", response_model=CallOut)
def reject_call(
    call_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles(*[r.value for r in UserRole])),
):
    call = _get_call(db, call_id)
    if call.receiver_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the called participant can reject",
        )
    if call.status not in (CallStatus.CALLING, CallStatus.RINGING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Call is {call.status.value}",
        )
    call.status = CallStatus.REJECTED
    call.ended_at = datetime.now(timezone.utc)
    call.end_reason = "rejected"
    db.commit()
    db.refresh(call)
    _publish_call("call.rejected", call.caller_id, call)
    _publish_call("call.rejected", call.receiver_id, call)
    return _call_out(db, call)


def _finish(call: CallSession, status_value: CallStatus, reason: str) -> None:
    now = datetime.now(timezone.utc)
    call.status = status_value
    call.ended_at = now
    call.end_reason = reason
    if call.connected_at is not None:
        connected = call.connected_at
        if connected.tzinfo is None:  # SQLite stores naive timestamps
            connected = connected.replace(tzinfo=timezone.utc)
        call.duration_seconds = max(0, int((now - connected).total_seconds()))


@router.post("/calls/{call_id}/end", response_model=CallOut)
def end_call(
    call_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles(*[r.value for r in UserRole])),
):
    call = _get_call(db, call_id)
    _require_participant(call, user)
    if call.status in ACTIVE_CALL:
        _finish(call, CallStatus.ENDED, f"ended_by_{user.role.value.lower()}")
        for participant in call.participants:
            participant.left_at = call.ended_at
        add_event(
            db,
            call.incident_id,
            "call_ended",
            "Voice call ended",
            actor_id=user.id,
        )
        db.commit()
        db.refresh(call)
        _publish_call("call.ended", call.caller_id, call)
        _publish_call("call.ended", call.receiver_id, call)
    return _call_out(db, call)


@router.post("/calls/{call_id}/failed", response_model=CallOut)
def fail_call(
    call_id: uuid.UUID,
    body: CallFailRequest,
    db: DbDep,
    user: User = Depends(require_roles(*[r.value for r in UserRole])),
):
    call = _get_call(db, call_id)
    _require_participant(call, user)
    if call.status in ACTIVE_CALL:
        _finish(call, CallStatus.FAILED, body.reason)
        db.commit()
        db.refresh(call)
        _publish_call("call.failed", call.caller_id, call)
        _publish_call("call.failed", call.receiver_id, call)
    return _call_out(db, call)
