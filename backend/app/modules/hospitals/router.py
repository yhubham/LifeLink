import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import DbDep, require_roles
from app.core.config import settings
from app.models import (
    AlertStatus,
    AuditLog,
    Hospital,
    HospitalAlert,
    Incident,
    IncidentStatus,
    Patient,
    TriageRecord,
    User,
)
from app.models.user import utcnow
from app.services.geo import eta_minutes, haversine_km
from app.services.hospital_discovery import (
    HospitalDiscoveryUnavailable,
    discover_hospitals,
)
from app.services.incident_events import add_event
from app.services.realtime import publish

router = APIRouter(tags=["hospitals"])

STAFF = ("ADMIN", "AMBULANCE", "HOSPITAL", "POLICE", "RESCUE")


class CapacityUpdate(BaseModel):
    total_beds: int | None = Field(default=None, ge=0, le=10000)
    available_beds: int | None = Field(default=None, ge=0, le=10000)


class AlertCreate(BaseModel):
    incident_id: uuid.UUID
    hospital_id: uuid.UUID
    eta_minutes: int | None = Field(default=None, ge=0, le=600)
    message: str | None = None


def _hospital_dict(h: Hospital, distance_km: float | None = None) -> dict:
    data = {
        "id": h.id,
        "name": h.name,
        "address": h.address,
        "latitude": h.latitude,
        "longitude": h.longitude,
        "specialties": h.specialties or [],
        "total_beds": h.total_beds,
        "available_beds": h.available_beds,
        "is_active": h.is_active,
    }
    if distance_km is not None:
        data["distance_km"] = round(distance_km, 2)
        data["eta_minutes"] = eta_minutes(distance_km)
    return data


def _patient_rows(db, incident_id: uuid.UUID) -> list[dict]:
    patients = db.scalars(
        select(Patient)
        .where(Patient.incident_id == incident_id)
        .order_by(Patient.display_name)
    ).all()
    rows = []
    for p in patients:
        latest = db.scalar(
            select(TriageRecord)
            .where(TriageRecord.patient_id == p.id)
            .order_by(TriageRecord.created_at.desc())
            .limit(1)
        )
        rows.append(
            {
                "id": p.id,
                "display_name": p.display_name,
                "age": p.age,
                "consciousness": p.consciousness,
                "breathing": p.breathing,
                "bleeding": p.bleeding,
                "priority_level": latest.priority_level if latest else None,
            }
        )
    return rows


def _alert_dict(db, alert: HospitalAlert) -> dict:
    hospital = db.get(Hospital, alert.hospital_id)
    incident = db.get(Incident, alert.incident_id)
    patients = _patient_rows(db, alert.incident_id) if incident else []
    return {
        "id": alert.id,
        "alert_status": alert.alert_status.value,
        "eta_minutes": alert.eta_minutes,
        "message": alert.message,
        "created_at": alert.created_at,
        "acknowledged_at": alert.acknowledged_at,
        "arrival_acknowledged_at": alert.arrival_acknowledged_at,
        "hospital": {
            "id": hospital.id,
            "name": hospital.name,
        }
        if hospital
        else None,
        "incident": {
            "id": incident.id,
            "public_code": incident.public_code,
            "incident_type": incident.incident_type,
            "address": incident.address,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "status": incident.status.value,
        }
        if incident
        else None,
        "patients": patients,
        "patient_count": len(patients),
    }


@router.get("/hospitals")
def list_hospitals(
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    hospitals = db.scalars(select(Hospital).order_by(Hospital.name)).all()
    alerts = _open_alert_counts(db)
    rows = []
    for h in hospitals:
        row = _hospital_dict(h)
        row["open_alerts"] = alerts.get(h.id, 0)
        rows.append(row)
    return rows


def _open_alert_counts(db) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(HospitalAlert.hospital_id, func.count())
        .where(HospitalAlert.alert_status == AlertStatus.SENT)
        .group_by(HospitalAlert.hospital_id)
    ).all()
    return {hospital_id: count for hospital_id, count in rows}


@router.get("/hospitals/discover")
def discover_nearby_hospitals(
    db: DbDep,
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius: int | None = Query(
        default=None,
        ge=500,
        le=20000,
        description="Search radius in metres (default 5000).",
    ),
    radius_m: int | None = Query(
        default=None, ge=500, le=20000, include_in_schema=False
    ),
    limit: int = Query(default=50, ge=1, le=50),
):
    """Public nearby-hospital search backed by the Geoapify Places API.

    The browser sends the coordinates it actually obtained (GPS, manual entry
    or map pin). Rows are nearest-first and explicitly marked as unverified for
    bed availability. If a Geoapify place can be matched to a registered
    LifeLink hospital, that hospital's live capacity is attached and
    ``availability_verified`` becomes true.
    """
    search_radius = radius or radius_m or settings.HOSPITAL_DISCOVERY_RADIUS_M
    try:
        rows = discover_hospitals(latitude, longitude, search_radius, limit)
    except HospitalDiscoveryUnavailable as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=str(exc)
        ) from exc

    registered = db.scalars(select(Hospital).where(Hospital.is_active.is_(True))).all()
    for row in rows:
        match = None
        for hospital in registered:
            same_name = hospital.name.strip().casefold() == row["name"].strip().casefold()
            close = (
                haversine_km(
                    row["latitude"],
                    row["longitude"],
                    hospital.latitude,
                    hospital.longitude,
                )
                <= 0.35
            )
            if same_name or close:
                match = hospital
                break
        if match is not None:
            row["registered_hospital_id"] = str(match.id)
            row["available_beds"] = match.available_beds
            row["total_beds"] = match.total_beds
            row["specialties"] = match.specialties or []
            row["availability_verified"] = True
        else:
            row["registered_hospital_id"] = None
            row["available_beds"] = None
            row["total_beds"] = None
            row["specialties"] = []
            row["availability_verified"] = False

    return {
        "results": rows,
        "count": len(rows),
        "center": {"latitude": latitude, "longitude": longitude},
        "radius_m": search_radius,
        "source": "Geoapify Places API",
        "category": settings.GEOAPIFY_CATEGORY,
        "availability_note": (
            "Discovered hospitals come from Geoapify (including OpenStreetMap "
            "places) but their bed availability is not verified. Only registered "
            "hospitals with live capacity show verified bed counts."
        ),
    }


@router.get("/hospitals/nearby")
def nearby_hospitals(
    db: DbDep,
    latitude: float | None = None,
    longitude: float | None = None,
    q: str | None = None,
    specialty: str | None = None,
    min_beds: int = 0,
    max_distance_km: float | None = None,
    limit: int = 20,
    _: User = Depends(require_roles(*STAFF)),
):
    """Real-time hospital finder.

    Filters active hospitals by name (``q``), specialty and available beds, then
    ranks them by distance from ``latitude``/``longitude`` when supplied. Each
    row carries ``distance_km``, ``eta_minutes`` and the count of open pre-alerts
    so dashboards can refresh live without extra requests.
    """
    stmt = select(Hospital).where(Hospital.is_active.is_(True))
    if q and q.strip():
        stmt = stmt.where(Hospital.name.ilike(f"%{q.strip()}%"))
    if min_beds:
        stmt = stmt.where(Hospital.available_beds >= min_beds)
    hospitals = db.scalars(stmt.order_by(Hospital.name)).all()

    has_coords = latitude is not None and longitude is not None
    alerts = _open_alert_counts(db)
    wanted = specialty.strip().lower() if specialty and specialty.strip() else None

    rows = []
    for h in hospitals:
        if wanted:
            specs = [str(s).lower() for s in (h.specialties or [])]
            if wanted not in specs:
                continue
        distance = (
            haversine_km(latitude, longitude, h.latitude, h.longitude)
            if has_coords
            else None
        )
        if (
            max_distance_km is not None
            and distance is not None
            and distance > max_distance_km
        ):
            continue
        row = _hospital_dict(h, distance)
        row["open_alerts"] = alerts.get(h.id, 0)
        rows.append(row)

    if has_coords:
        rows.sort(key=lambda item: item["distance_km"])
    return rows[: max(1, min(limit, 50))]


@router.get("/hospitals/match")
def match_hospitals(
    db: DbDep,
    latitude: float,
    longitude: float,
    min_beds: int = 1,
    limit: int = 5,
    _: User = Depends(require_roles(*STAFF)),
):
    """Active hospitals with capacity, nearest first, with distance and ETA."""
    hospitals = db.scalars(
        select(Hospital).where(
            Hospital.is_active.is_(True),
            Hospital.available_beds >= min_beds,
        )
    ).all()
    ranked = sorted(
        (
            (_hospital_dict(h, haversine_km(latitude, longitude, h.latitude, h.longitude)))
            for h in hospitals
        ),
        key=lambda x: x["distance_km"],
    )
    return ranked[: max(1, min(limit, 20))]


@router.patch("/hospitals/{hospital_id}/capacity")
def update_capacity(
    hospital_id: uuid.UUID,
    body: CapacityUpdate,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN", "HOSPITAL")),
):
    hospital = db.get(Hospital, hospital_id)
    if hospital is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found"
        )
    if body.total_beds is not None:
        hospital.total_beds = body.total_beds
    if body.available_beds is not None:
        if body.available_beds > (body.total_beds or hospital.total_beds):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Available beds cannot exceed total beds",
            )
        hospital.available_beds = body.available_beds
    db.add(
        AuditLog(
            user_id=user.id,
            action="hospital.capacity_updated",
            entity_type="hospital",
            entity_id=hospital.id,
            details={
                "total_beds": hospital.total_beds,
                "available_beds": hospital.available_beds,
            },
        )
    )
    db.commit()
    db.refresh(hospital)
    publish(
        ["admin", "hospital", "ambulance"],
        "hospital.capacity_updated",
        {
            "hospital_id": str(hospital.id),
            "name": hospital.name,
            "total_beds": hospital.total_beds,
            "available_beds": hospital.available_beds,
        },
    )
    return _hospital_dict(hospital)


@router.post("/hospital-alerts", status_code=201)
def create_alert(
    body: AlertCreate,
    db: DbDep,
    user: User = Depends(require_roles("ADMIN", "AMBULANCE")),
):
    incident = db.get(Incident, body.incident_id)
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )
    hospital = db.get(Hospital, body.hospital_id)
    if hospital is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found"
        )
    existing = db.scalar(
        select(HospitalAlert).where(
            HospitalAlert.incident_id == incident.id,
            HospitalAlert.hospital_id == hospital.id,
            HospitalAlert.alert_status == AlertStatus.SENT,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An open pre-alert already exists for this hospital",
        )
    alert = HospitalAlert(
        id=uuid.uuid4(),
        incident_id=incident.id,
        hospital_id=hospital.id,
        eta_minutes=body.eta_minutes,
        alert_status=AlertStatus.SENT,
        message=body.message,
    )
    db.add(alert)
    add_event(
        db,
        incident.id,
        "hospital_pre_alert",
        f"Pre-alert sent to {hospital.name}",
        actor_id=user.id,
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="hospital.pre_alert_sent",
            entity_type="hospital_alert",
            entity_id=alert.id,
            details={
                "incident": incident.public_code,
                "hospital": hospital.name,
                "eta_minutes": body.eta_minutes,
            },
        )
    )
    db.commit()
    db.refresh(alert)
    publish(
        [
            "admin",
            "hospital",
            "ambulance",
            f"incidents/{incident.id}",
            f"tickets/{incident.id}",
        ],
        "hospital.alert",
        {
            "alert_id": str(alert.id),
            "incident_id": str(incident.id),
            "hospital_id": str(hospital.id),
            "hospital_name": hospital.name,
            "public_code": incident.public_code,
            "eta_minutes": alert.eta_minutes,
        },
    )
    return _alert_dict(db, alert)


@router.get("/hospital-alerts/incoming")
def incoming_alerts(
    db: DbDep,
    include_acknowledged: bool = False,
    _: User = Depends(require_roles(*STAFF)),
):
    stmt = select(HospitalAlert).order_by(HospitalAlert.created_at.desc())
    if not include_acknowledged:
        stmt = stmt.where(HospitalAlert.alert_status == AlertStatus.SENT)
    return [_alert_dict(db, a) for a in db.scalars(stmt).all()]


@router.post("/hospital-alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles("HOSPITAL", "ADMIN")),
):
    alert = db.get(HospitalAlert, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found"
        )
    if alert.alert_status == AlertStatus.ACKNOWLEDGED:
        return _alert_dict(db, alert)
    alert.alert_status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_at = utcnow()
    add_event(
        db,
        alert.incident_id,
        "hospital_alert_acknowledged",
        "Hospital acknowledged the pre-alert",
        actor_id=user.id,
    )
    db.add(
        AuditLog(
            user_id=user.id,
            action="hospital.alert_acknowledged",
            entity_type="hospital_alert",
            entity_id=alert.id,
        )
    )
    db.commit()
    db.refresh(alert)
    publish(
        [
            "admin",
            "hospital",
            "ambulance",
            f"incidents/{alert.incident_id}",
            f"tickets/{alert.incident_id}",
        ],
        "hospital.alert_acknowledged",
        {
            "alert_id": str(alert.id),
            "incident_id": str(alert.incident_id),
            "hospital_id": str(alert.hospital_id),
        },
    )
    return _alert_dict(db, alert)


@router.post("/hospital-alerts/{alert_id}/arrival")
def acknowledge_arrival(
    alert_id: uuid.UUID,
    db: DbDep,
    user: User = Depends(require_roles("HOSPITAL", "ADMIN")),
):
    """Hospital confirms the patient physically arrived at its emergency desk."""
    alert = db.get(HospitalAlert, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found"
        )
    incident = db.get(Incident, alert.incident_id)
    if incident is not None and incident.status not in (
        IncidentStatus.ARRIVED,
        IncidentStatus.CLOSED,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The ambulance has not arrived at the incident scene yet",
        )
    if alert.arrival_acknowledged_at is None:
        alert.arrival_acknowledged_at = utcnow()
        alert.arrival_acknowledged_by = user.id
        add_event(
            db,
            alert.incident_id,
            "hospital_arrival_acknowledged",
            "Hospital confirmed patient arrival",
            actor_id=user.id,
        )
        db.add(
            AuditLog(
                user_id=user.id,
                action="hospital.arrival_acknowledged",
                entity_type="hospital_alert",
                entity_id=alert.id,
            )
        )
        db.commit()
        db.refresh(alert)
        publish(
            [
                "admin",
                "hospital",
                "ambulance",
                f"incidents/{alert.incident_id}",
                f"tickets/{alert.incident_id}",
            ],
            "hospital.arrival_acknowledged",
            {
                "alert_id": str(alert.id),
                "incident_id": str(alert.incident_id),
                "hospital_id": str(alert.hospital_id),
            },
        )
    return _alert_dict(db, alert)
