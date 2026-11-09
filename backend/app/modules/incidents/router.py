import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.api.deps import DbDep, require_roles
from app.core.config import settings
from app.core.security import (
    create_ticket_token,
    decode_ticket_token,
    hash_pin,
    hash_token,
    new_ticket_pin,
    new_ticket_token,
    verify_pin,
    verify_token,
)
from app.models import (
    Ambulance,
    AmbulanceAssignment,
    AssignmentStatus,
    AuditLog,
    Hospital,
    HospitalAlert,
    Incident,
    IncidentMedia,
    IncidentStatus,
    Patient,
    User,
)
from app.schemas.incident import (
    IncidentCreate,
    IncidentCreateOut,
    IncidentDetailOut,
    IncidentOut,
    IncidentStatusUpdate,
    MediaOut,
    PatientCreate,
    PatientOut,
    TicketAccessRequest,
    TicketAccessResponse,
    TicketDetailOut,
)
from app.services.incident_events import add_event
from app.services.rate_limit import AttemptLimiter
from app.services.realtime import publish

router = APIRouter(tags=["incidents"])

STAFF = ("ADMIN", "AMBULANCE", "HOSPITAL", "POLICE", "RESCUE")
ACTIVE_ASSIGNMENT = (
    AssignmentStatus.ASSIGNED,
    AssignmentStatus.ACCEPTED,
    AssignmentStatus.EN_ROUTE,
    AssignmentStatus.ARRIVED,
)

_MEDIA_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_MEDIA_MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
_MAX_MEDIA_PER_INCIDENT = 12

# Five wrong PINs per ticket number in a rolling 15-minute window. This is
# process-local; a multi-worker deployment should back it with Redis.
_ticket_pin_limiter = AttemptLimiter(max_attempts=5, window_seconds=15 * 60)


def _broadcast(incident: Incident, event: str) -> None:
    publish(
        [
            "admin",
            f"incidents/{incident.id}",
            f"tickets/{incident.id}",
        ],
        event,
        {
            "incident_id": str(incident.id),
            "public_code": incident.public_code,
            "incident_type": incident.incident_type,
            "status": incident.status.value,
        },
    )


def _next_public_code(db) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"LL-{year}-"
    codes = db.scalars(
        select(Incident.public_code).where(Incident.public_code.like(f"{prefix}%"))
    ).all()
    highest = 0
    for code in codes:
        try:
            highest = max(highest, int(code.rsplit("-", 1)[1]))
        except (IndexError, ValueError):
            continue
    return f"{prefix}{highest + 1:04d}"


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


def _active_assignment(db, incident_id: uuid.UUID) -> AmbulanceAssignment | None:
    return db.scalar(
        select(AmbulanceAssignment)
        .where(
            AmbulanceAssignment.incident_id == incident_id,
            AmbulanceAssignment.assignment_status.in_(ACTIVE_ASSIGNMENT),
        )
        .order_by(AmbulanceAssignment.assigned_at.desc())
    )


def _ticket_detail(db, incident: Incident) -> TicketDetailOut:
    patient_count = (
        db.scalar(
            select(func.count())
            .select_from(Patient)
            .where(Patient.incident_id == incident.id)
        )
        or 0
    )

    ambulance_row = None
    assignment = _active_assignment(db, incident.id)
    if assignment is not None:
        ambulance = db.get(Ambulance, assignment.ambulance_id)
        if ambulance is not None:
            ambulance_row = {
                "call_sign": ambulance.call_sign,
                "vehicle_number": ambulance.vehicle_number,
                "assignment_status": assignment.assignment_status.value,
                "assigned_at": assignment.assigned_at,
            }

    alert = db.scalar(
        select(HospitalAlert)
        .where(HospitalAlert.incident_id == incident.id)
        .order_by(HospitalAlert.created_at.desc())
    )
    hospital_row = None
    if alert is not None:
        hospital = db.get(Hospital, alert.hospital_id)
        if hospital is not None:
            hospital_row = {
                "name": hospital.name,
                "address": hospital.address,
                "alert_status": alert.alert_status.value,
                "eta_minutes": alert.eta_minutes,
                "arrival_acknowledged_at": alert.arrival_acknowledged_at,
            }

    return TicketDetailOut(
        incident_id=incident.id,
        ticket_number=incident.public_code,
        incident_type=incident.incident_type,
        description=incident.description,
        address=incident.address,
        landmark=incident.landmark,
        latitude=incident.latitude,
        longitude=incident.longitude,
        reported_at=incident.reported_at,
        status=incident.status,
        patient_count=patient_count,
        injured_count=incident.injured_count,
        preferred_hospital=incident.preferred_hospital,
        ambulance=ambulance_row,
        hospital=hospital_row,
        timeline=incident.events,
    )


def _incident_from_ticket_token(db, token: str | None) -> Incident:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A ticket access token is required",
        )
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    try:
        payload = decode_ticket_token(token)
        incident = db.get(Incident, uuid.UUID(payload["sub"]))
    except Exception:  # noqa: BLE001 - malformed/expired token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ticket token is invalid or expired",
        ) from None
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )
    if payload.get("code") != incident.public_code:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ticket token does not match this ticket",
        )
    return incident


def _can_access_incident(db, user: User, incident_id: uuid.UUID) -> bool:
    """Media access: admins plus the crew/hospital actually attached to the incident."""
    if user.role.value == "ADMIN":
        return True
    if user.role.value == "AMBULANCE":
        assignments = db.scalars(
            select(AmbulanceAssignment).where(
                AmbulanceAssignment.incident_id == incident_id,
                AmbulanceAssignment.assignment_status.in_(ACTIVE_ASSIGNMENT),
            )
        ).all()
        for assignment in assignments:
            ambulance = db.get(Ambulance, assignment.ambulance_id)
            if ambulance is not None and ambulance.crew_user_id in (None, user.id):
                return True
        return False
    if user.role.value == "HOSPITAL":
        return (
            db.scalar(
                select(HospitalAlert).where(
                    HospitalAlert.incident_id == incident_id,
                )
            )
            is not None
        )
    return False


@router.post("/incidents", response_model=IncidentCreateOut, status_code=201)
def create_incident(body: IncidentCreate, db: DbDep):
    """Public SOS reporting — no staff account required.

    Returns the ticket number plus one-time access credentials. Only hashes are
    stored, so these values cannot be retrieved again.
    """
    access_token = new_ticket_token()
    access_pin = new_ticket_pin()
    incident = Incident(
        id=uuid.uuid4(),
        public_code=_next_public_code(db),
        incident_type=body.incident_type,
        description=body.description,
        latitude=body.latitude,
        longitude=body.longitude,
        address=body.address,
        landmark=body.landmark,
        injured_count=body.injured_count,
        preferred_hospital=(
            body.preferred_hospital.model_dump()
            if body.preferred_hospital is not None
            else None
        ),
        status=IncidentStatus.REPORTED,
        ticket_token_hash=hash_token(access_token),
        ticket_pin_hash=hash_pin(access_pin),
        ticket_created_at=datetime.now(timezone.utc),
    )
    db.add(incident)
    for p in body.patients:
        db.add(Patient(id=uuid.uuid4(), incident_id=incident.id, **p.model_dump()))
    db.flush()
    add_event(
        db,
        incident.id,
        "reported",
        "Incident reported",
        status=IncidentStatus.REPORTED.value,
    )
    _log(db, None, "incident.created", incident.id, {"code": incident.public_code})
    db.commit()
    db.refresh(incident)
    _broadcast(incident, "incident.created")

    detail = IncidentDetailOut.model_validate(incident).model_dump()
    return {**detail, "access_token": access_token, "access_pin": access_pin,
            "ticket_token": create_ticket_token(str(incident.id), incident.public_code)}


@router.get("/incidents/track/{public_code}", response_model=IncidentOut)
def track_incident(public_code: str, db: DbDep):
    """Legacy minimal status lookup by code (no patient details exposed).

    The ticket page uses the PIN-protected endpoints below instead.
    """
    incident = db.scalar(
        select(Incident).where(Incident.public_code == public_code.upper())
    )
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )
    return incident


@router.post("/incidents/ticket/access", response_model=TicketAccessResponse)
def access_ticket(body: TicketAccessRequest, db: DbDep):
    """Exchange a ticket number + PIN for a short-lived signed ticket token."""
    public_code = body.public_code.strip().upper()
    retry_after = _ticket_pin_limiter.retry_after(public_code)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect PIN attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    incident = db.scalar(
        select(Incident).where(Incident.public_code == public_code)
    )
    if incident is None or not verify_pin(body.pin.strip(), incident.ticket_pin_hash):
        _ticket_pin_limiter.record_failure(public_code)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ticket number or PIN is incorrect",
        )
    _ticket_pin_limiter.reset(public_code)
    incident.ticket_last_accessed_at = datetime.now(timezone.utc)
    _log(db, None, "ticket.accessed", incident.id)
    db.commit()
    db.refresh(incident)
    return TicketAccessResponse(
        ticket_token=create_ticket_token(str(incident.id), incident.public_code),
        expires_in_minutes=settings.TICKET_TOKEN_EXPIRE_MINUTES,
        ticket=_ticket_detail(db, incident),
    )


@router.get("/incidents/ticket/{public_code}", response_model=TicketDetailOut)
def get_ticket(
    public_code: str,
    db: DbDep,
    authorization: str | None = Header(default=None),
    x_ticket_token: str | None = Header(default=None),
):
    incident = _incident_from_ticket_token(db, authorization or x_ticket_token)
    if incident.public_code != public_code.strip().upper():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ticket token does not match this ticket",
        )
    return _ticket_detail(db, incident)


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
    by_status = {status_name: 0 for status_name in IncidentStatus.__members__}
    for status_value, count in db.execute(
        select(Incident.status, func.count()).group_by(Incident.status)
    ).all():
        by_status[status_value.value] = count
    by_type = {
        t: c
        for t, c in db.execute(
            select(Incident.incident_type, func.count()).group_by(Incident.incident_type)
        ).all()
    }
    patients = db.scalar(select(func.count()).select_from(Patient)) or 0
    start_of_day = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today = (
        db.scalar(
            select(func.count())
            .select_from(Incident)
            .where(Incident.reported_at >= start_of_day)
        )
        or 0
    )
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
    return _get_incident(db, incident_id)


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
    add_event(
        db,
        incident.id,
        "status_changed",
        f"Status changed to {body.status.value}",
        status=body.status.value,
        actor_id=user.id,
    )
    _log(db, user.id, "incident.status_changed", incident.id, {"status": body.status.value})
    db.commit()
    db.refresh(incident)
    _broadcast(incident, "incident.updated")
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
    add_event(
        db,
        incident.id,
        "verified",
        "Incident verified by control room",
        status=IncidentStatus.VERIFIED.value,
        actor_id=user.id,
    )
    _log(db, user.id, "incident.verified", incident.id)
    db.commit()
    db.refresh(incident)
    _broadcast(incident, "incident.updated")
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
    add_event(
        db,
        incident.id,
        "closed",
        "Incident closed",
        status=IncidentStatus.CLOSED.value,
        actor_id=user.id,
    )
    _log(db, user.id, "incident.closed", incident.id)
    db.commit()
    db.refresh(incident)
    _broadcast(incident, "incident.updated")
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
    publish(
        ["admin", "hospital", f"tickets/{incident_id}"],
        "patient.added",
        {"incident_id": str(incident_id), "patient_id": str(patient.id)},
    )
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


# --- Accident media -------------------------------------------------------


def _media_out(media: IncidentMedia) -> dict:
    return {
        "id": media.id,
        "incident_id": media.incident_id,
        "patient_id": media.patient_id,
        "original_name": media.original_name,
        "content_type": media.content_type,
        "size_bytes": media.size_bytes,
        "created_at": media.created_at,
        "file_url": f"/incidents/{media.incident_id}/media/{media.id}/file",
    }


def _valid_magic(content_type: str, data: bytes) -> bool:
    signatures = _MEDIA_MAGIC.get(content_type, ())
    if content_type == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return any(data.startswith(sig) for sig in signatures)


@router.post(
    "/incidents/{incident_id}/media",
    response_model=MediaOut,
    status_code=201,
)
def upload_incident_media(
    incident_id: uuid.UUID,
    file: UploadFile,
    db: DbDep,
    x_ticket_token: str | None = Header(default=None),
    patient_id: uuid.UUID | None = None,
):
    """Upload one image using the reporter's one-time ticket token.

    Validation is enforced server-side: allowed MIME type, magic bytes, size
    limit and a per-incident count limit. Files are stored outside the public
    web root and only served through an authorized endpoint.
    """
    incident = _get_incident(db, incident_id)
    if not verify_token(x_ticket_token, incident.ticket_token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid ticket access token is required to upload images",
        )

    allowed = {
        item.strip().lower()
        for item in settings.MEDIA_ALLOWED_TYPES.split(",")
        if item.strip()
    }
    content_type = (file.content_type or "").lower()
    if content_type not in allowed or content_type not in _MEDIA_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPG, PNG and WebP images are accepted",
        )

    data = file.file.read(settings.MEDIA_MAX_BYTES + 1)
    if len(data) > settings.MEDIA_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "Image is too large. Maximum size is "
                f"{settings.MEDIA_MAX_BYTES // (1024 * 1024)} MB."
            ),
        )
    if not data or not _valid_magic(content_type, data):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File contents do not match an allowed image format",
        )

    existing = (
        db.scalar(
            select(func.count())
            .select_from(IncidentMedia)
            .where(IncidentMedia.incident_id == incident.id)
        )
        or 0
    )
    if existing >= _MAX_MEDIA_PER_INCIDENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A maximum of {_MAX_MEDIA_PER_INCIDENT} images is allowed per incident",
        )

    if patient_id is not None:
        patient = db.get(Patient, patient_id)
        if patient is None or patient.incident_id != incident.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Patient does not belong to this incident",
            )

    media_id = uuid.uuid4()
    extension = _MEDIA_EXTENSIONS[content_type]
    relative = Path(str(incident.id)) / f"{media_id}{extension}"
    root = Path(settings.MEDIA_STORAGE_DIR)
    try:
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not store the image",
        ) from exc

    media = IncidentMedia(
        id=media_id,
        incident_id=incident.id,
        patient_id=patient_id,
        file_url=str(relative).replace("\\", "/"),
        media_type="photo",
        original_name=(file.filename or "image")[:255],
        content_type=content_type,
        size_bytes=len(data),
    )
    db.add(media)
    add_event(db, incident.id, "media_added", "Incident photos uploaded")
    db.commit()
    db.refresh(media)
    publish(
        ["admin", f"incidents/{incident.id}", f"tickets/{incident.id}"],
        "incident.media_added",
        {"incident_id": str(incident.id), "media_id": str(media.id)},
    )
    return _media_out(media)


@router.get("/incidents/{incident_id}/media", response_model=list[MediaOut])
def list_incident_media(
    incident_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles(*STAFF)),
):
    _get_incident(db, incident_id)
    if not _can_access_incident(db, user, incident_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view images for this incident",
        )
    rows = db.scalars(
        select(IncidentMedia)
        .where(IncidentMedia.incident_id == incident_id)
        .order_by(IncidentMedia.created_at)
    ).all()
    return [_media_out(row) for row in rows]


@router.get("/incidents/{incident_id}/media/{media_id}/file")
def incident_media_file(
    incident_id: uuid.UUID,
    media_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles(*STAFF)),
):
    if not _can_access_incident(db, user, incident_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view images for this incident",
        )
    media = db.get(IncidentMedia, media_id)
    if media is None or media.incident_id != incident_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found"
        )
    root = Path(settings.MEDIA_STORAGE_DIR).resolve()
    target = (root / media.file_url).resolve()
    if root not in target.parents or not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image file is missing"
        )
    return FileResponse(
        target,
        media_type=media.content_type or "application/octet-stream",
        filename=media.original_name or target.name,
        headers={"Cache-Control": "private, no-store"},
    )
