import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import CallStatus


class CallCreate(BaseModel):
    incident_id: uuid.UUID
    receiver_id: uuid.UUID | None = None


class CallActor(BaseModel):
    id: uuid.UUID
    full_name: str
    role: str


class CallOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    incident_id: uuid.UUID
    public_code: str | None = None
    room: str
    status: CallStatus
    caller: CallActor
    receiver: CallActor
    started_at: datetime
    connected_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int | None
    end_reason: str | None


class CallFailRequest(BaseModel):
    reason: str = Field(default="connection_failed", max_length=200)


class IceConfigOut(BaseModel):
    ice_servers: list[dict]
    voice_only: bool = True
