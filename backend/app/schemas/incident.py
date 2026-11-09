import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import IncidentStatus


class PatientCreate(BaseModel):
    display_name: str = Field(default="Unknown", max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    consciousness: str | None = Field(default=None, max_length=64)
    breathing: str | None = Field(default=None, max_length=64)
    bleeding: str | None = Field(default=None, max_length=64)
    additional_notes: str | None = Field(default=None, max_length=2000)


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    incident_id: uuid.UUID
    display_name: str
    age: int | None
    consciousness: str | None
    breathing: str | None
    bleeding: str | None
    additional_notes: str | None


class PreferredHospital(BaseModel):
    osm_id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    distance_km: float | None = Field(default=None, ge=0)
    availability_verified: bool = False


class IncidentCreate(BaseModel):
    incident_type: str = Field(min_length=2, max_length=64)
    description: str | None = Field(default=None, min_length=5, max_length=4000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
    landmark: str | None = Field(default=None, max_length=300)
    injured_count: int = Field(default=1, ge=0, le=500)
    preferred_hospital: PreferredHospital | None = None
    patients: list[PatientCreate] = Field(default_factory=list, max_length=50)


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    public_code: str
    incident_type: str
    description: str | None
    latitude: float
    longitude: float
    address: str | None
    landmark: str | None
    injured_count: int
    preferred_hospital: dict | None
    status: IncidentStatus
    reported_at: datetime
    closed_at: datetime | None


class IncidentDetailOut(IncidentOut):
    patients: list[PatientOut] = []


class IncidentCreateOut(IncidentDetailOut):
    """Returned once on creation. The PIN/token are never retrievable again."""

    access_token: str
    access_pin: str
    ticket_token: str


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus


class IncidentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_type: str
    message: str
    status: str | None
    created_at: datetime


class TicketAmbulance(BaseModel):
    call_sign: str
    vehicle_number: str | None = None
    assignment_status: str
    assigned_at: datetime | None = None


class TicketHospital(BaseModel):
    name: str
    address: str | None = None
    alert_status: str
    eta_minutes: int | None = None
    arrival_acknowledged_at: datetime | None = None


class TicketDetailOut(BaseModel):
    incident_id: uuid.UUID
    ticket_number: str
    incident_type: str
    description: str | None
    address: str | None
    landmark: str | None
    latitude: float
    longitude: float
    reported_at: datetime
    status: IncidentStatus
    patient_count: int
    injured_count: int
    preferred_hospital: dict | None
    ambulance: TicketAmbulance | None = None
    hospital: TicketHospital | None = None
    timeline: list[IncidentEventOut] = []


class TicketAccessRequest(BaseModel):
    public_code: str = Field(min_length=3, max_length=32)
    pin: str = Field(min_length=4, max_length=12)


class TicketAccessResponse(BaseModel):
    ticket_token: str
    expires_in_minutes: int
    ticket: TicketDetailOut


class MediaOut(BaseModel):
    id: uuid.UUID
    incident_id: uuid.UUID
    patient_id: uuid.UUID | None
    original_name: str | None
    content_type: str | None
    size_bytes: int | None
    created_at: datetime
    file_url: str
