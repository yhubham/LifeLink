import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import DbDep, require_roles
from app.models import (
    Ambulance,
    AmbulanceAssignment,
    AmbulanceLocation,
    AmbulanceStatus,
    AssignmentStatus,
    AuditLog,
    Incident,
    IncidentStatus,
    User,
)
from app.models.user import utcnow
from app.services.geo import eta_minutes, haversine_km, move_towards
from app.services.incident_events import add_event
from app.services.realtime import publish

router = APIRouter(tags=["ambulances"])

STAFF = ("ADMIN", "AMBULANCE", "HOSPITAL", "POLICE", "RESCUE")
ACTIVE = (AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.EN_ROUTE, AssignmentStatus.ARRIVED)

SIMULATED_STEP_KM = 0.8


class AmbulanceCreate(BaseModel):
    call_sign: str = Field(min_length=2, max_length=32)
    vehicle_number: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    crew_user_id: uuid.UUID | None = None


class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AssignmentCreate(BaseModel):
    incident_id: uuid.UUID
    ambulance_id: uuid.UUID


class AssignmentStatusUpdate(BaseModel):
    assignment_status: AssignmentStatus


def _ambulance_dict(a: Ambulance) -> dict:
    return {
        "id": a.id,
        "call_sign": a.call_sign,
        "vehicle_number": a.vehicle_number,
        "status": a.status.value,
        "latitude": a.latitude,
        "longitude": a.longitude,
        "last_location_update": a.last_location_update,
        "crew_user_id": a.crew_user_id,
    }


def _assignment_dict(db, assignment: AmbulanceAssignment) -> dict:
    incident = db.get(Incident, assignment.incident_id)
    ambulance = db.get(Ambulance, assignment.ambulance_id)
    return {
        "id": assignment.id,
        "incident_id": assignment.incident_id,
        "ambulance_id": assignment.ambulance_id,
        "assignment_status": assignment.assignment_status.value,
        "assigned_at": assignment.assigned_at,
        "arrival_at": assignment.arrival_at,
        "completed_at": assignment.completed_at,
        "call_sign": ambulance.call_sign if ambulance else None,
        "vehicle_number": ambulance.vehicle_number if ambulance else None,
        "incident_public_code": incident.public_code if incident else None,
        "incident_type": incident.incident_type if incident else None,
        "incident_status": incident.status.value if incident else None,
        "incident_address": incident.address if incident else None,
        "incident_latitude": incident.latitude if incident else None,
        "incident_longitude": incident.longitude if incident else None,
    }


def _active_assignment_for_incident(db, incident_id: uuid.UUID) -> AmbulanceAssignment | None:
    return db.scalar(
        select(AmbulanceAssignment)
        .where(
            AmbulanceAssignment.incident_id == incident_id,
            AmbulanceAssignment.assignment_status.in_(ACTIVE),
        )
        .order_by(AmbulanceAssignment.assigned_at.desc())
    )


@router.get("/ambulances")
def list_ambulances(
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    ambulances = db.scalars(select(Ambulance).order_by(Ambulance.call_sign)).all()
    return [_ambulance_dict(a) for a in ambulances]


@router.post("/ambulances", status_code=201)
def create_ambulance(
    body: AmbulanceCreate,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN")),
):
    if db.scalar(select(Ambulance).where(Ambulance.call_sign == body.call_sign)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Call sign already exists"
        )
    ambulance = Ambulance(
        id=uuid.uuid4(),
        call_sign=body.call_sign,
        vehicle_number=body.vehicle_number,
        status=AmbulanceStatus.AVAILABLE,
        latitude=body.latitude,
        longitude=body.longitude,
        crew_user_id=body.crew_user_id,
    )
    db.add(ambulance)
    db.add(
        AuditLog(
            user_id=user.id,
            action="ambulance.created",
            entity_type="ambulance",
            entity_id=ambulance.id,
            details={"call_sign": ambulance.call_sign},
        )
    )
    db.commit()
    db.refresh(ambulance)
    publish(
        "admin",
        "fleet.updated",
        {"ambulance_id": str(ambulance.id), "call_sign": ambulance.call_sign},
    )
    return _ambulance_dict(ambulance)


@router.post("/ambulances/{ambulance_id}/location")
def update_location(
    ambulance_id: uuid.UUID,
    body: LocationUpdate,
    db: DbDep,
    _: User = Depends(require_roles("ADMIN", "AMBULANCE")),
):
    ambulance = db.get(Ambulance, ambulance_id)
    if ambulance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ambulance not found"
        )
    ambulance.latitude = body.latitude
    ambulance.longitude = body.longitude
    ambulance.last_location_update = utcnow()
    db.add(
        AmbulanceLocation(
            id=uuid.uuid4(),
            ambulance_id=ambulance.id,
            latitude=body.latitude,
            longitude=body.longitude,
        )
    )
    db.commit()
    db.refresh(ambulance)
    publish(
        ["admin", "ambulance"],
        "ambulance.moved",
        {
            "ambulance_id": str(ambulance.id),
            "call_sign": ambulance.call_sign,
            "latitude": ambulance.latitude,
            "longitude": ambulance.longitude,
            "status": ambulance.status.value,
        },
    )
    return _ambulance_dict(ambulance)


@router.get("/assignments")
def list_assignments(
    db: DbDep,
    incident_id: uuid.UUID | None = None,
    active_only: bool = False,
    _: User = Depends(require_roles(*STAFF)),
):
    stmt = select(AmbulanceAssignment).order_by(
        AmbulanceAssignment.assigned_at.desc()
    )
    if incident_id is not None:
        stmt = stmt.where(AmbulanceAssignment.incident_id == incident_id)
    if active_only:
        stmt = stmt.where(AmbulanceAssignment.assignment_status.in_(ACTIVE))
    return [_assignment_dict(db, a) for a in db.scalars(stmt).all()]


@router.get("/assignments/mine")
def my_assignments(
    db: DbDep,
    user: User = Depends(require_roles("AMBULANCE", "ADMIN")),
):
    """Assignments for this crew, matched through ``Ambulance.crew_user_id``.

    Legacy demo rows without a crew link remain visible to crews so the seeded
    simulation keeps working.
    """
    stmt = (
        select(AmbulanceAssignment)
        .where(AmbulanceAssignment.assignment_status.in_(ACTIVE))
        .order_by(AmbulanceAssignment.assigned_at.desc())
    )
    if user.role.value == "AMBULANCE":
        ambulance_ids = db.scalars(
            select(Ambulance.id).where(
                (Ambulance.crew_user_id == user.id)
                | (Ambulance.crew_user_id.is_(None))
            )
        ).all()
        stmt = stmt.where(AmbulanceAssignment.ambulance_id.in_(ambulance_ids))
    return [_assignment_dict(db, a) for a in db.scalars(stmt).all()]


@router.post("/assignments", status_code=201)
def create_assignment(
    body: AssignmentCreate,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN")),
):
    incident = db.get(Incident, body.incident_id)
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )
    if incident.status in (IncidentStatus.CLOSED, IncidentStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Incident is already closed",
        )
    if _active_assignment_for_incident(db, incident.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Incident already has an active ambulance assignment",
        )
    ambulance = db.get(Ambulance, body.ambulance_id)
    if ambulance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ambulance not found"
        )
    if ambulance.status != AmbulanceStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ambulance is {ambulance.status.value}, not AVAILABLE",
        )

    assignment = AmbulanceAssignment(
        id=uuid.uuid4(),
        incident_id=incident.id,
        ambulance_id=ambulance.id,
        assigned_by=user.id,
        assignment_status=AssignmentStatus.ASSIGNED,
    )
    ambulance.status = AmbulanceStatus.ASSIGNED
    incident.status = IncidentStatus.ASSIGNED
    db.add(assignment)
    add_event(
        db,
        incident.id,
        "assigned",
        f"Ambulance {ambulance.call_sign} assigned",
        status=IncidentStatus.ASSIGNED.value,
        actor_id=user.id,
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="ambulance.assigned",
            entity_type="incident",
            entity_id=incident.id,
            details={
                "ambulance": ambulance.call_sign,
                "assignment_id": str(assignment.id),
            },
        )
    )
    db.commit()
    db.refresh(assignment)
    publish(
        ["admin", "ambulance", f"incidents/{incident.id}", f"tickets/{incident.id}"],
        "assignment.updated",
        {
            "assignment_id": str(assignment.id),
            "incident_id": str(incident.id),
            "public_code": incident.public_code,
            "call_sign": ambulance.call_sign,
            "status": assignment.assignment_status.value,
            "incident_status": incident.status.value,
        },
    )
    return _assignment_dict(db, assignment)


@router.patch("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: uuid.UUID,
    body: AssignmentStatusUpdate,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN", "AMBULANCE")),
):
    assignment = db.get(AmbulanceAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    incident = db.get(Incident, assignment.incident_id)
    ambulance = db.get(Ambulance, assignment.ambulance_id)
    new_status = body.assignment_status

    if assignment.assignment_status in (
        AssignmentStatus.COMPLETED,
        AssignmentStatus.CANCELLED,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assignment is already finished",
        )

    assignment.assignment_status = new_status

    if new_status == AssignmentStatus.ACCEPTED:
        if ambulance:
            ambulance.status = AmbulanceStatus.ASSIGNED
    elif new_status == AssignmentStatus.EN_ROUTE:
        if ambulance:
            ambulance.status = AmbulanceStatus.EN_ROUTE
        if incident and incident.status not in (
            IncidentStatus.ARRIVED,
            IncidentStatus.CLOSED,
        ):
            incident.status = IncidentStatus.RESPONDING
    elif new_status == AssignmentStatus.ARRIVED:
        assignment.arrival_at = utcnow()
        if ambulance:
            ambulance.status = AmbulanceStatus.ON_SCENE
        if incident:
            incident.status = IncidentStatus.ARRIVED
    elif new_status == AssignmentStatus.COMPLETED:
        assignment.completed_at = utcnow()
        if ambulance:
            ambulance.status = AmbulanceStatus.AVAILABLE
    elif new_status == AssignmentStatus.CANCELLED:
        if ambulance:
            ambulance.status = AmbulanceStatus.AVAILABLE
        if incident and incident.status in (
            IncidentStatus.ASSIGNED,
            IncidentStatus.RESPONDING,
        ):
            incident.status = IncidentStatus.VERIFIED

    db.add(
        AuditLog(
            user_id=user.id,
            action="assignment.status_changed",
            entity_type="ambulance_assignment",
            entity_id=assignment.id,
            details={"status": new_status.value},
        )
    )
    event_messages = {
        AssignmentStatus.ACCEPTED: "Crew accepted the assignment",
        AssignmentStatus.EN_ROUTE: "Ambulance responding to the incident",
        AssignmentStatus.ARRIVED: "Ambulance arrived on scene",
        AssignmentStatus.COMPLETED: "Assignment completed",
        AssignmentStatus.CANCELLED: "Assignment cancelled",
    }
    if new_status in event_messages:
        add_event(
            db,
            assignment.incident_id,
            f"assignment_{new_status.value.lower()}",
            event_messages[new_status],
            status=incident.status.value if incident else None,
            actor_id=user.id,
        )
    db.commit()
    db.refresh(assignment)
    publish(
        [
            "admin",
            "ambulance",
            f"incidents/{assignment.incident_id}",
            f"tickets/{assignment.incident_id}",
        ],
        "assignment.updated",
        {
            "assignment_id": str(assignment.id),
            "incident_id": str(assignment.incident_id),
            "public_code": incident.public_code if incident else None,
            "call_sign": ambulance.call_sign if ambulance else None,
            "status": assignment.assignment_status.value,
            "incident_status": incident.status.value if incident else None,
            "ambulance_status": ambulance.status.value if ambulance else None,
        },
    )
    return _assignment_dict(db, assignment)


@router.post("/assignments/{assignment_id}/simulate-step")
def simulate_step(
    assignment_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN", "AMBULANCE")),
):
    """Advance the simulated ambulance 0.8 km towards the incident."""
    assignment = db.get(AmbulanceAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    if assignment.assignment_status in (
        AssignmentStatus.COMPLETED,
        AssignmentStatus.CANCELLED,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assignment is already finished",
        )
    incident = db.get(Incident, assignment.incident_id)
    ambulance = db.get(Ambulance, assignment.ambulance_id)
    if incident is None or ambulance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident or ambulance missing",
        )
    if ambulance.latitude is None or ambulance.longitude is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ambulance has no GPS position",
        )

    distance_before = haversine_km(
        ambulance.latitude, ambulance.longitude, incident.latitude, incident.longitude
    )
    new_lat, new_lon, distance_after = move_towards(
        ambulance.latitude,
        ambulance.longitude,
        incident.latitude,
        incident.longitude,
        SIMULATED_STEP_KM,
    )

    ambulance.latitude = new_lat
    ambulance.longitude = new_lon
    ambulance.last_location_update = utcnow()
    db.add(
        AmbulanceLocation(
            id=uuid.uuid4(),
            ambulance_id=ambulance.id,
            latitude=new_lat,
            longitude=new_lon,
        )
    )

    arrived = distance_after == 0.0
    if arrived:
        assignment.assignment_status = AssignmentStatus.ARRIVED
        assignment.arrival_at = utcnow()
        ambulance.status = AmbulanceStatus.ON_SCENE
        incident.status = IncidentStatus.ARRIVED
        add_event(
            db,
            incident.id,
            "arrived",
            "Ambulance arrived on scene",
            status=IncidentStatus.ARRIVED.value,
            actor_id=user.id,
        )
    else:
        assignment.assignment_status = AssignmentStatus.EN_ROUTE
        ambulance.status = AmbulanceStatus.EN_ROUTE
        if incident.status in (
            IncidentStatus.REPORTED,
            IncidentStatus.VERIFIED,
            IncidentStatus.ASSIGNED,
        ):
            incident.status = IncidentStatus.RESPONDING

    db.add(
        AuditLog(
            user_id=user.id,
            action="ambulance.simulated_step",
            entity_type="ambulance_assignment",
            entity_id=assignment.id,
            details={
                "distance_before_km": round(distance_before, 3),
                "distance_after_km": round(distance_after, 3),
                "arrived": arrived,
            },
        )
    )
    db.commit()
    db.refresh(assignment)
    db.refresh(ambulance)
    publish(
        ["admin", "ambulance", f"incidents/{incident.id}", f"tickets/{incident.id}"],
        "ambulance.moved",
        {
            "assignment_id": str(assignment.id),
            "ambulance_id": str(ambulance.id),
            "call_sign": ambulance.call_sign,
            "latitude": ambulance.latitude,
            "longitude": ambulance.longitude,
            "distance_km": round(distance_after, 3),
            "eta_minutes": eta_minutes(distance_after),
            "arrived": arrived,
            "assignment_status": assignment.assignment_status.value,
            "incident_id": str(incident.id),
            "incident_status": incident.status.value,
        },
    )

    return {
        "assignment_id": assignment.id,
        "assignment_status": assignment.assignment_status.value,
        "ambulance_id": ambulance.id,
        "call_sign": ambulance.call_sign,
        "latitude": ambulance.latitude,
        "longitude": ambulance.longitude,
        "distance_km": round(distance_after, 3),
        "eta_minutes": eta_minutes(distance_after),
        "arrived": arrived,
        "incident_status": incident.status.value,
    }
