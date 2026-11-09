import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, require_roles
from app.models import Patient, TriageRecord, User
from app.services import triage_engine

router = APIRouter(tags=["triage"])

STAFF = ("ADMIN", "AMBULANCE", "HOSPITAL", "POLICE", "RESCUE")


def _get_patient(db, patient_id: uuid.UUID) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return patient


@router.post("/patients/{patient_id}/triage", status_code=201)
def submit_triage(
    patient_id: uuid.UUID,
    body: dict,
    db: DbDep,
    user: User = Depends(require_roles(*STAFF)),
):
    """Run the demo engine and store a new assessment (history is kept)."""
    patient = _get_patient(db, patient_id)
    answers = body.get("answers") or {}
    priority, reason = triage_engine.assess(patient, answers)
    record = TriageRecord(
        id=uuid.uuid4(),
        patient_id=patient_id,
        priority_level=priority,
        protocol=triage_engine.PROTOCOL,
        assessment_answers=answers,
        reason=reason,
        assessed_by=user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "patient_id": patient_id,
        "priority_level": priority,
        "label": triage_engine.LABELS[priority],
        "reason": reason,
        "protocol": record.protocol,
        "created_at": record.created_at,
    }


@router.get("/patients/{patient_id}/triage")
def triage_history(
    patient_id: uuid.UUID,
    db: DbDep,
    _: User = Depends(require_roles(*STAFF)),
):
    patient = _get_patient(db, patient_id)
    records = db.scalars(
        select(TriageRecord)
        .where(TriageRecord.patient_id == patient.id)
        .order_by(TriageRecord.created_at.desc())
    ).all()
    return [
        {
            "id": r.id,
            "priority_level": r.priority_level,
            "label": triage_engine.LABELS.get(r.priority_level, r.priority_level),
            "reason": r.reason,
            "protocol": r.protocol,
            "is_human_reviewed": r.is_human_reviewed,
            "created_at": r.created_at,
        }
        for r in records
    ]
