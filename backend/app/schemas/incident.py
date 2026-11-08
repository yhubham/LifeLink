import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import IncidentStatus


class PatientCreate(BaseModel):
    display_name: str = Field(default="Unknown", max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    consciousness: str | None = None
    breathing: str | None = None
    bleeding: str | None = None
    additional_notes: str | None = None


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


class IncidentCreate(BaseModel):
    incident_type: str = Field(min_length=2, max_length=64)
    description: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str | None = None
    patients: list[PatientCreate] = Field(default_factory=list)


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    public_code: str
    incident_type: str
    description: str | None
    latitude: float
    longitude: float
    address: str | None
    status: IncidentStatus
    reported_at: datetime
    closed_at: datetime | None


class IncidentDetailOut(IncidentOut):
    patients: list[PatientOut] = []


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus
