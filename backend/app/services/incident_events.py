import uuid

from sqlalchemy.orm import Session

from app.models import IncidentEvent


def add_event(
    db: Session,
    incident_id: uuid.UUID,
    event_type: str,
    message: str,
    *,
    status: str | None = None,
    actor_id: uuid.UUID | None = None,
) -> IncidentEvent:
    """Stage a safe timeline entry (caller commits with the rest of the unit of work)."""
    event = IncidentEvent(
        incident_id=incident_id,
        event_type=event_type,
        message=message,
        status=status,
        actor_id=actor_id,
    )
    db.add(event)
    return event
