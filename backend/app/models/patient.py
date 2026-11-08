import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.user import utcnow


class PriorityLevel(str, Enum):
    L1 = "L1"  # Immediate
    L2 = "L2"  # Urgent
    L3 = "L3"  # Minor
    L4 = "L4"  # Walking wounded


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id"), index=True
    )
    display_name: Mapped[str] = mapped_column(String(120), default="Unknown")
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consciousness: Mapped[str | None] = mapped_column(String(64), nullable=True)
    breathing: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bleeding: Mapped[str | None] = mapped_column(String(64), nullable=True)
    additional_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    incident = relationship("Incident", back_populates="patients")
    triage_records = relationship(
        "TriageRecord", back_populates="patient", order_by="TriageRecord.created_at"
    )


class TriageRecord(Base):
    __tablename__ = "triage_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), index=True)
    priority_level: Mapped[str] = mapped_column(String(4))  # L1..L4
    protocol: Mapped[str] = mapped_column(String(64), default="demo-sim-v1")
    assessment_answers: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    is_human_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )

    patient = relationship("Patient", back_populates="triage_records")


class FirstAidSession(Base):
    __tablename__ = "first_aid_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), index=True)
    guidance_type: Mapped[str] = mapped_column(String(64))
    completed_steps: Mapped[list | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
