import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    DateTime,
    Double,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.user import utcnow


class IncidentStatus(str, Enum):
    REPORTED = "REPORTED"
    VERIFIED = "VERIFIED"
    ASSIGNED = "ASSIGNED"
    RESPONDING = "RESPONDING"
    ARRIVED = "ARRIVED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    public_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    incident_type: Mapped[str] = mapped_column(String(64), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float] = mapped_column(Double)
    longitude: Mapped[float] = mapped_column(Double)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    landmark: Mapped[str | None] = mapped_column(Text, nullable=True)
    injured_count: Mapped[int] = mapped_column(Integer, default=1)
    # Hospital the reporter picked from OpenStreetMap discovery. This is only a
    # preference, never a guarantee that the hospital has capacity.
    preferred_hospital: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[IncidentStatus] = mapped_column(
        SAEnum(IncidentStatus), default=IncidentStatus.REPORTED, index=True
    )
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Ticket access secrets are stored as hashes only. The clear token and PIN
    # are returned exactly once, in the create response.
    ticket_token_hash: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True
    )
    ticket_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ticket_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ticket_last_accessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    patients = relationship("Patient", back_populates="incident")
    media = relationship(
        "IncidentMedia", back_populates="incident", order_by="IncidentMedia.created_at"
    )
    events = relationship(
        "IncidentEvent",
        back_populates="incident",
        order_by="IncidentEvent.created_at",
    )


class IncidentMedia(Base):
    __tablename__ = "incident_media"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id"), index=True
    )
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("patients.id"), nullable=True
    )
    # Relative, private storage key. Files are never served as static assets.
    file_url: Mapped[str] = mapped_column(Text)
    media_type: Mapped[str] = mapped_column(String(16))  # photo | video
    original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    incident = relationship("Incident", back_populates="media")


class IncidentEvent(Base):
    """Safe, public timeline entry for an incident ticket.

    Deliberately contains no patient data so it can be returned to the
    reporter when they unlock their ticket.
    """

    __tablename__ = "incident_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incidents.id"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )

    incident = relationship("Incident", back_populates="events")
