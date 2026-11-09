import uuid

from sqlalchemy import select

from app.models import User


def _create_incident(client):
    response = client.post(
        "/api/v1/incidents",
        json={
            "incident_type": "Medical emergency",
            "description": "Voice call test incident",
            "latitude": 28.61,
            "longitude": 77.21,
            "patients": [{"display_name": "Test Patient"}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _setup_assignment(client, db, admin_headers, *, crew_email=None):
    crew = None
    crew_id = None
    if crew_email:
        crew = db.scalar(select(User).where(User.email == crew_email))
        assert crew is not None
        crew_id = str(crew.id)
    incident = _create_incident(client)
    ambulance = client.post(
        "/api/v1/ambulances",
        headers=admin_headers,
        json={
            "call_sign": f"AMB-{uuid.uuid4().hex[:6]}",
            "vehicle_number": "DL-1-CALL-0001",
            "crew_user_id": crew_id,
        },
    )
    assert ambulance.status_code == 201, ambulance.text
    assignment = client.post(
        "/api/v1/assignments",
        headers=admin_headers,
        json={
            "incident_id": incident["id"],
            "ambulance_id": ambulance.json()["id"],
        },
    )
    assert assignment.status_code in (200, 201), assignment.text
    return incident, crew, ambulance.json()


def test_control_room_calls_assigned_crew(
    client, db, admin_headers, ambulance_headers
):
    incident, crew, _ = _setup_assignment(
        client, db, admin_headers, crew_email="crew1@lifelink.demo"
    )

    response = client.post(
        "/api/v1/calls",
        headers=admin_headers,
        json={"incident_id": incident["id"]},
    )
    assert response.status_code == 201, response.text
    call = response.json()
    assert call["status"] == "RINGING"
    assert call["receiver"]["id"] == str(crew.id)
    assert call["caller"]["role"] == "ADMIN"
    assert call["public_code"] == incident["public_code"]

    # Only one active call per incident.
    duplicate = client.post(
        "/api/v1/calls",
        headers=admin_headers,
        json={"incident_id": incident["id"]},
    )
    assert duplicate.status_code == 409

    # Only the receiver can accept.
    assert (
        client.post(
            f"/api/v1/calls/{call['id']}/accept", headers=admin_headers
        ).status_code
        == 403
    )
    accepted = client.post(
        f"/api/v1/calls/{call['id']}/accept", headers=ambulance_headers
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "CONNECTED"
    assert accepted.json()["connected_at"]

    active = client.get("/api/v1/calls/active", headers=ambulance_headers)
    assert active.status_code == 200
    assert [row["id"] for row in active.json()] == [call["id"]]

    ended = client.post(
        f"/api/v1/calls/{call['id']}/end", headers=admin_headers
    )
    assert ended.status_code == 200, ended.text
    assert ended.json()["status"] == "ENDED"
    assert ended.json()["duration_seconds"] >= 0
    assert ended.json()["ended_at"]

    history = client.get("/api/v1/calls/history", headers=ambulance_headers)
    assert history.status_code == 200
    assert any(row["id"] == call["id"] for row in history.json())


def test_crew_calls_control_room_and_rejects(
    client, db, admin_headers, ambulance_headers
):
    incident, _, _ = _setup_assignment(
        client, db, admin_headers, crew_email="crew1@lifelink.demo"
    )

    response = client.post(
        "/api/v1/calls",
        headers=ambulance_headers,
        json={"incident_id": incident["id"]},
    )
    assert response.status_code == 201, response.text
    call = response.json()
    assert call["caller"]["role"] == "AMBULANCE"
    assert call["receiver"]["role"] == "ADMIN"

    rejected = client.post(
        f"/api/v1/calls/{call['id']}/reject", headers=admin_headers
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "REJECTED"

    # A rejected call no longer blocks the incident.
    again = client.post(
        "/api/v1/calls",
        headers=ambulance_headers,
        json={"incident_id": incident["id"]},
    )
    assert again.status_code == 201, again.text


def test_call_authorization_and_missing_crew(
    client, db, admin_headers, hospital_headers
):
    # Hospital accounts cannot initiate voice calls.
    incident, _, _ = _setup_assignment(client, db, admin_headers)
    forbidden = client.post(
        "/api/v1/calls",
        headers=hospital_headers,
        json={"incident_id": incident["id"]},
    )
    assert forbidden.status_code == 403

    # Dispatch without a crew link cannot be called.
    no_crew = client.post(
        "/api/v1/calls",
        headers=admin_headers,
        json={"incident_id": incident["id"]},
    )
    assert no_crew.status_code == 409
    assert "crew" in no_crew.json()["detail"].lower()


def test_call_participants_and_ice_config(
    client, db, admin_headers, ambulance_headers, hospital_headers
):
    incident, _, _ = _setup_assignment(
        client, db, admin_headers, crew_email="crew1@lifelink.demo"
    )
    call = client.post(
        "/api/v1/calls",
        headers=admin_headers,
        json={"incident_id": incident["id"]},
    ).json()

    hospital_get = client.get(
        f"/api/v1/calls/{call['id']}", headers=hospital_headers
    )
    assert hospital_get.status_code == 403

    crew_get = client.get(
        f"/api/v1/calls/{call['id']}", headers=ambulance_headers
    )
    assert crew_get.status_code == 200

    ice = client.get("/api/v1/calls/ice-config", headers=ambulance_headers)
    assert ice.status_code == 200
    payload = ice.json()
    assert payload["voice_only"] is True
    assert isinstance(payload["ice_servers"], list)
    assert payload["ice_servers"][0]["urls"]
