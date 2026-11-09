import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbDep, require_roles
from app.models import AuditLog, Incident, IncidentStatus, Patient, User
from app.schemas.incident import (
    IncidentCreate,
    IncidentDetailOut,
    IncidentOut,
    IncidentStatusUpdate,
    PatientCreate,
    PatientOut,
)

router = APIRouter(tags=["incidents"])

STAFF = ("ADMIN", "AMBULANCE", "HOSPITAL", "POLICE", "RESCUE")


def _next_public_code(db) -> str:
    year = datetime.now(timezone.utc).year
    count = db.scalar(
        select(func.count())
        .select_from(Incident)
        .where(func.extract("year", Incident.reported_at) == year)
    )
    return f"LL-{year}-{count + 1:04d}"


def _log(db, user_id: uuid.UUID | None, action: str, entity_id, details=None):
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type="incident",
            entity_id=entity_id,
            details=details,
        )
    )


def _get_incident(db, incident_id: uuid.UUID) -> Incident:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )
    return incident


@router.post("/incidents", response_model=IncidentDetailOut, status_code=201)
def create_incident(body: IncidentCreate, db: DbDep):
    """Public SOS reporting — no staff account required."""
    incident = Incident(
        id=uuid.uuid4(),
        public_code=_next_public_code(db),
        incident_type=body.incident_type,
        description=body.description,
        latitude=body.latitude,
        longitude=body.longitude,
        address=body.address,
        status=IncidentStatus.REPORTED,
    )
    db.add(incident)
    for p in body.patients:
        db.add(Patient(id=uuid.uuid4(), incident_id=incident.id, **p.model_dump()))
    db.flush()
    _log(db, None, "incident.created", incident.id, {"code": incident.public_code})
    db.commit()
    db.refresh(incident)
    return incident


@router.get("/incidents/track/{public_code}", response_model=IncidentOut)
def track_incident(public_code: str, db: DbDep):
    """Public status lookup by code (no patient details exposed)."""
    incident = db.scalar(
        select(Incident).where(Incident.public_code == public_code.upper())
    )
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )
    return incident


@router.get("/incidents", response_model=list[IncidentOut])
def list_incidents(
    db: DbDep,
    user: User = Depends(require_roles(*STAFF)),
    incident_status: IncidentStatus | None = None,
):
    stmt = select(Incident).order_by(Incident.reported_at.desc())
    if incident_status is not None:
        stmt = stmt.where(Incident.status == incident_status)
    return db.scalars(stmt).all()


@router.get("/incidents/stats")
def incident_stats(
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    total = db.scalar(select(func.count()).select_from(Incident)) or 0
    by_status = {
        status_name: 0 for status_name in IncidentStatus.__members__
    }
    for status_value, count in db.execute(
        select(Incident.status, func.count()).group_by(Incident.status)
    ).all():
        by_status[status_value.value] = count
    by_type = {
        t: c
        for t, c in db.execute(
            select(Incident.incident_type, func.count()).group_by(
                Incident.incident_type
            )
        ).all()
    }
    patients = db.scalar(select(func.count()).select_from(Patient)) or 0
    start_of_day = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today = db.scalar(
        select(func.count())
        .select_from(Incident)
        .where(Incident.reported_at >= start_of_day)
    ) or 0
    active = total - by_status["CLOSED"] - by_status["CANCELLED"]
    return {
        "total": total,
        "active": active,
        "today": today,
        "patients": patients,
        "by_status": by_status,
        "by_type": by_type,
    }


@router.get("/incidents/{incident_id}", response_model=IncidentDetailOut)
def get_incident(
    incident_id: uuid.UUID,
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    incident = _get_incident(db, incident_id)
    return incident


@router.patch("/incidents/{incident_id}", response_model=IncidentOut)
def update_incident(
    incident_id: uuid.UUID,
    body: IncidentStatusUpdate,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN")),
):
    incident = _get_incident(db, incident_id)
    incident.status = body.status
    if body.status == IncidentStatus.CLOSED:
        incident.closed_at = datetime.now(timezone.utc)
    _log(db, user.id, "incident.status_changed", incident.id, {"status": body.status.value})
    db.commit()
    db.refresh(incident)
    return incident


@router.post("/incidents/{incident_id}/verify", response_model=IncidentOut)
def verify_incident(
    incident_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN", "POLICE")),
):
    incident = _get_incident(db, incident_id)
    if incident.status != IncidentStatus.REPORTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot verify incident in status {incident.status.value}",
        )
    incident.status = IncidentStatus.VERIFIED
    _log(db, user.id, "incident.verified", incident.id)
    db.commit()
    db.refresh(incident)
    return incident


@router.post("/incidents/{incident_id}/close", response_model=IncidentOut)
def close_incident(
    incident_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN")),
):
    incident = _get_incident(db, incident_id)
    if incident.status in (IncidentStatus.CLOSED, IncidentStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Incident is already closed",
        )
    incident.status = IncidentStatus.CLOSED
    incident.closed_at = datetime.now(timezone.utc)
    _log(db, user.id, "incident.closed", incident.id)
    db.commit()
    db.refresh(incident)
    return incident


@router.post(
    "/incidents/{incident_id}/patients",
    response_model=PatientOut,
    status_code=201,
)
def add_patient(
    incident_id: uuid.UUID,
    body: PatientCreate,
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    _get_incident(db, incident_id)
    patient = Patient(id=uuid.uuid4(), incident_id=incident_id, **body.model_dump())
    db.add(patient)
    _log(db, None, "patient.added", patient.id, {"incident": str(incident_id)})
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/incidents/{incident_id}/patients", response_model=list[PatientOut])
def list_patients(
    incident_id: uuid.UUID,
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    _get_incident(db, incident_id)
    return db.scalars(
        select(Patient).where(Patient.incident_id == incident_id)
    ).all()


@router.get("/patients/{patient_id}")
def get_patient(
    patient_id: uuid.UUID,
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    """Patient detail with incident context and the latest triage record."""
    from app.models import TriageRecord

    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    incident = db.get(Incident, patient.incident_id)
    latest = db.scalar(
        select(TriageRecord)
        .where(TriageRecord.patient_id == patient.id)
        .order_by(TriageRecord.created_at.desc())
        .limit(1)
    )
    return {
        "id": patient.id,
        "incident_id": patient.incident_id,
        "display_name": patient.display_name,
        "age": patient.age,
        "consciousness": patient.consciousness,
        "breathing": patient.breathing,
        "bleeding": patient.bleeding,
        "additional_notes": patient.additional_notes,
        "incident": {
            "id": incident.id,
            "public_code": incident.public_code,
            "incident_type": incident.incident_type,
            "address": incident.address,
            "status": incident.status.value,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
        }
        if incident
        else None,
        "latest_triage": {
            "priority_level": latest.priority_level,
            "reason": latest.reason,
            "protocol": latest.protocol,
            "created_at": latest.created_at,
        }
        if latest
        else None,
    }
