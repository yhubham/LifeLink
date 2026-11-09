import uuid

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import Incident, User
from app.modules.incidents import router as incidents_router


@pytest.fixture(autouse=True)
def _clear_ticket_pin_limiter():
    # Public codes restart at LL-2026-0001 in each isolated test database, so
    # clear the process-local limiter between tests to avoid cross-test locks.
    incidents_router._ticket_pin_limiter.reset_all()
    yield


def _create_incident(client):
    response = client.post(
        "/api/v1/incidents",
        json={
            "incident_type": "Road accident",
            "description": "Secure ticket test incident",
            "latitude": 28.612,
            "longitude": 77.209,
            "address": "Test Avenue, New Delhi",
            "landmark": "Opposite the metro station",
            "injured_count": 1,
            "patients": [{"display_name": "Test Patient", "age": 30}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_incident_returns_one_time_credentials_and_stores_hashes(
    client, db
):
    created = _create_incident(client)
    assert created["public_code"].startswith("LL-")
    assert len(created["access_pin"]) == 6
    assert created["access_token"]
    assert created["ticket_token"]

    incident = db.get(Incident, uuid.UUID(created["id"]))
    db.refresh(incident)
    assert incident.ticket_pin_hash
    assert incident.ticket_token_hash
    assert incident.ticket_pin_hash != created["access_pin"]
    assert incident.ticket_token_hash != created["access_token"]
    assert created["landmark"] == "Opposite the metro station"
    assert created["injured_count"] == 1


def test_ticket_pin_exchange_and_safe_detail(client):
    created = _create_incident(client)
    code = created["public_code"]

    wrong = client.post(
        "/api/v1/incidents/ticket/access",
        json={"public_code": code, "pin": "000000"},
    )
    assert wrong.status_code == 401

    unlocked = client.post(
        "/api/v1/incidents/ticket/access",
        json={"public_code": code, "pin": created["access_pin"]},
    )
    assert unlocked.status_code == 200, unlocked.text
    payload = unlocked.json()
    assert payload["ticket_token"]
    assert payload["ticket"]["ticket_number"] == code
    assert "patients" not in payload["ticket"]
    assert payload["ticket"]["timeline"][0]["event_type"] == "reported"

    detail = client.get(
        f"/api/v1/incidents/ticket/{code}",
        headers={"Authorization": f"Bearer {payload['ticket_token']}"},
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["ticket_number"] == code

    no_token = client.get(f"/api/v1/incidents/ticket/{code}")
    assert no_token.status_code == 401

    other_code = client.get(
        "/api/v1/incidents/ticket/LL-1999-9999",
        headers={"Authorization": f"Bearer {payload['ticket_token']}"},
    )
    assert other_code.status_code == 401


def _wrong_pin(created) -> str:
    return "000000" if created["access_pin"] != "000000" else "000001"


def test_ticket_pin_locks_after_repeated_failures(client):
    created = _create_incident(client)
    code = created["public_code"]
    wrong = _wrong_pin(created)

    for _ in range(5):
        response = client.post(
            "/api/v1/incidents/ticket/access",
            json={"public_code": code, "pin": wrong},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/v1/incidents/ticket/access",
        json={"public_code": code, "pin": created["access_pin"]},
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1


def test_ticket_pin_success_clears_failure_counter(client):
    created = _create_incident(client)
    code = created["public_code"]
    wrong = _wrong_pin(created)

    for _ in range(4):
        response = client.post(
            "/api/v1/incidents/ticket/access",
            json={"public_code": code, "pin": wrong},
        )
        assert response.status_code == 401

    unlocked = client.post(
        "/api/v1/incidents/ticket/access",
        json={"public_code": code, "pin": created["access_pin"]},
    )
    assert unlocked.status_code == 200

    # A typo after a successful unlock starts a fresh window, not a lockout.
    again = client.post(
        "/api/v1/incidents/ticket/access",
        json={"public_code": code, "pin": wrong},
    )
    assert again.status_code == 401


def test_ticket_token_cannot_authenticate_staff(client):
    created = _create_incident(client)

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {created['ticket_token']}"},
    )
    assert response.status_code == 401


def _assign_crew(client, db, admin_headers):
    crew = db.scalar(
        select(User).where(User.email == "crew1@lifelink.demo")
    )
    assert crew is not None
    created = _create_incident(client)
    ambulance = client.post(
        "/api/v1/ambulances",
        headers=admin_headers,
        json={
            "call_sign": f"AMB-{uuid.uuid4().hex[:6]}",
            "vehicle_number": "DL-1-TEST-0001",
            "crew_user_id": str(crew.id),
        },
    )
    assert ambulance.status_code == 201, ambulance.text
    assignment = client.post(
        "/api/v1/assignments",
        headers=admin_headers,
        json={
            "incident_id": created["id"],
            "ambulance_id": ambulance.json()["id"],
        },
    )
    assert assignment.status_code in (200, 201), assignment.text
    return created, crew, ambulance.json()


def test_media_upload_requires_ticket_token_and_is_private(
    client, db, admin_headers, ambulance_headers, hospital_headers, tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(settings, "MEDIA_STORAGE_DIR", str(tmp_path))
    created = _create_incident(client)
    incident_id = created["id"]
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

    denied = client.post(
        f"/api/v1/incidents/{incident_id}/media",
        files={"file": ("scene.png", png, "image/png")},
    )
    assert denied.status_code == 401

    uploaded = client.post(
        f"/api/v1/incidents/{incident_id}/media",
        files={"file": ("scene.png", png, "image/png")},
        headers={"X-Ticket-Token": created["access_token"]},
    )
    assert uploaded.status_code == 201, uploaded.text
    media = uploaded.json()
    assert media["content_type"] == "image/png"
    assert media["size_bytes"] == len(png)

    # Unattached hospital and unassigned crew must not see scene photos.
    assert (
        client.get(
            f"/api/v1/incidents/{incident_id}/media",
            headers=hospital_headers,
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/v1/incidents/{incident_id}/media",
            headers=ambulance_headers,
        ).status_code
        == 403
    )

    admin_list = client.get(
        f"/api/v1/incidents/{incident_id}/media", headers=admin_headers
    )
    assert admin_list.status_code == 200
    assert len(admin_list.json()) == 1

    streamed = client.get(
        f"/api/v1/incidents/{incident_id}/media/{media['id']}/file",
        headers=admin_headers,
    )
    assert streamed.status_code == 200
    assert streamed.content == png
    assert streamed.headers["cache-control"] == "private, no-store"

    # Once the crew is assigned, they gain access.
    assigned_created, _crew, _ambulance = _assign_crew(
        client, db, admin_headers
    )
    assigned_upload = client.post(
        f"/api/v1/incidents/{assigned_created['id']}/media",
        files={"file": ("scene.png", png, "image/png")},
        headers={"X-Ticket-Token": assigned_created["access_token"]},
    )
    assert assigned_upload.status_code == 201, assigned_upload.text
    crew_list = client.get(
        f"/api/v1/incidents/{assigned_created['id']}/media",
        headers=ambulance_headers,
    )
    assert crew_list.status_code == 200, crew_list.text


def test_media_rejects_unsupported_type(
    client, tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "MEDIA_STORAGE_DIR", str(tmp_path))
    created = _create_incident(client)
    response = client.post(
        f"/api/v1/incidents/{created['id']}/media",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers={"X-Ticket-Token": created["access_token"]},
    )
    assert response.status_code == 415
