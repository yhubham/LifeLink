import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import DbDep
from app.models import FirstAidSession, Incident, Patient, TriageRecord
from app.services import first_aid_content

router = APIRouter(tags=["first-aid"])

# Guidance is open to the public witness flow: a person who reported an
# incident can open guidance for their patient without a staff account.


def _patient_with_context(db, patient_id: uuid.UUID) -> tuple[Patient, Incident, str | None]:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    incident = db.get(Incident, patient.incident_id)
    latest = db.scalar(
        select(TriageRecord)
        .where(TriageRecord.patient_id == patient_id)
        .order_by(TriageRecord.created_at.desc())
        .limit(1)
    )
    return patient, incident, latest.priority_level if latest else None


@router.get("/patients/{patient_id}/guidance")
def get_guidance(patient_id: uuid.UUID, db: DbDep):
    patient, incident, priority = _patient_with_context(db, patient_id)
    # Before any triage exists, derive an initial suggestion from observations
    if priority is None:
        from app.services import triage_engine

        priority, _ = triage_engine.assess(patient, {})
    guide = first_aid_content.guidance_for(
        priority, incident.incident_type if incident else None
    )
    guide["patient_id"] = patient_id
    guide["display_name"] = patient.display_name
    return guide


@router.post("/patients/{patient_id}/guidance/sessions", status_code=201)
def start_session(patient_id: uuid.UUID, db: DbDep):
    patient, incident, priority = _patient_with_context(db, patient_id)
    session = FirstAidSession(
        id=uuid.uuid4(),
        patient_id=patient_id,
        guidance_type=priority or "L3",
        completed_steps=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "patient_id": patient_id,
        "guidance_type": session.guidance_type,
        "started_at": session.started_at,
    }


@router.patch("/guidance/sessions/{session_id}")
def update_session(session_id: uuid.UUID, body: dict, db: DbDep):
    session = db.get(FirstAidSession, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    steps = body.get("completed_steps")
    if steps is not None:
        session.completed_steps = [int(s) for s in steps]
    if body.get("completed") is True:
        session.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "patient_id": session.patient_id,
        "guidance_type": session.guidance_type,
        "completed_steps": session.completed_steps,
        "completed_at": session.completed_at,
    }
