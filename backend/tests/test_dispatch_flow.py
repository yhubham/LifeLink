import uuid

from app.models import Hospital


def _create_incident(client, patients=None):
    response = client.post(
        "/api/v1/incidents",
        json={
            "incident_type": "Road accident",
            "description": "Automated test incident",
            "latitude": 28.6120,
            "longitude": 77.2090,
            "address": "Test Avenue, New Delhi",
            "patients": patients or [{"display_name": "Test Patient", "age": 30}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_public_report_verify_and_close(client, admin_headers):
    incident = _create_incident(client)
    assert incident["public_code"].startswith("LL-")
    assert incident["status"] == "REPORTED"

    verified = client.post(
        f"/api/v1/incidents/{incident['id']}/verify", headers=admin_headers
    )
    assert verified.status_code == 200
    assert verified.json()["status"] == "VERIFIED"

    closed = client.post(
        f"/api/v1/incidents/{incident['id']}/close", headers=admin_headers
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "CLOSED"
    assert closed.json()["closed_at"] is not None


def test_full_dispatch_flow_reaches_arrived_and_completes(client, admin_headers):
    incident = _create_incident(client)

    ambulance_response = client.post(
        "/api/v1/ambulances",
        headers=admin_headers,
        json={
            "call_sign": "AMB-FLOW",
            "vehicle_number": "DL-9-FL-0001",
            "latitude": 28.6100,
            "longitude": 77.2100,
        },
    )
    assert ambulance_response.status_code == 201, ambulance_response.text
    ambulance = ambulance_response.json()

    assignment_response = client.post(
        "/api/v1/assignments",
        headers=admin_headers,
        json={"incident_id": incident["id"], "ambulance_id": ambulance["id"]},
    )
    assert assignment_response.status_code == 201, assignment_response.text
    assignment = assignment_response.json()
    assert assignment["assignment_status"] == "ASSIGNED"

    en_route = client.patch(
        f"/api/v1/assignments/{assignment['id']}",
        headers=admin_headers,
        json={"assignment_status": "EN_ROUTE"},
    )
    assert en_route.status_code == 200
    assert en_route.json()["assignment_status"] == "EN_ROUTE"

    arrived = False
    for _ in range(60):
        step = client.post(
            f"/api/v1/assignments/{assignment['id']}/simulate-step",
            headers=admin_headers,
        )
        assert step.status_code == 200, step.text
        if step.json()["arrived"]:
            arrived = True
            break
    assert arrived, "simulation never reached the incident"

    detail = client.get(
        f"/api/v1/incidents/{incident['id']}", headers=admin_headers
    ).json()
    assert detail["status"] == "ARRIVED"

    complete = client.patch(
        f"/api/v1/assignments/{assignment['id']}",
        headers=admin_headers,
        json={"assignment_status": "COMPLETED"},
    )
    assert complete.status_code == 200
    assert complete.json()["assignment_status"] == "COMPLETED"

    fleet = client.get("/api/v1/ambulances", headers=admin_headers).json()
    unit = next(row for row in fleet if row["id"] == ambulance["id"])
    assert unit["status"] == "AVAILABLE"


def test_triage_assessment_is_stored(client, admin_headers):
    incident = _create_incident(
        client, patients=[{"display_name": "Triage Patient", "consciousness": "unresponsive"}]
    )
    detail = client.get(
        f"/api/v1/incidents/{incident['id']}", headers=admin_headers
    ).json()
    patient_id = detail["patients"][0]["id"]

    result = client.post(
        f"/api/v1/patients/{patient_id}/triage",
        headers=admin_headers,
        json={
            "answers": {
                "airway": "obstructed",
                "breathing_rate": "absent",
                "circulation": "absent",
                "ambulatory": "no",
            }
        },
    )
    assert result.status_code == 201, result.text
    assert result.json()["priority_level"] == "L1"

    history = client.get(
        f"/api/v1/patients/{patient_id}/triage", headers=admin_headers
    ).json()
    assert len(history) == 1
    assert history[0]["priority_level"] == "L1"


def test_pre_alert_acknowledge_and_capacity(client, admin_headers, hospital_headers, db):
    hospital = Hospital(
        id=uuid.uuid4(),
        name="Flow Test Hospital",
        latitude=28.6100,
        longitude=77.2100,
        specialties=["Trauma"],
        total_beds=40,
        available_beds=12,
        is_active=True,
    )
    db.add(hospital)
    db.commit()

    incident = _create_incident(client)
    alert_response = client.post(
        "/api/v1/hospital-alerts",
        headers=admin_headers,
        json={
            "incident_id": incident["id"],
            "hospital_id": str(hospital.id),
            "eta_minutes": 9,
            "message": "Incoming trauma patient",
        },
    )
    assert alert_response.status_code == 201, alert_response.text
    alert = alert_response.json()
    assert alert["alert_status"] == "SENT"

    incoming = client.get(
        "/api/v1/hospital-alerts/incoming", headers=hospital_headers
    ).json()
    assert any(row["id"] == alert["id"] for row in incoming)

    acknowledged = client.post(
        f"/api/v1/hospital-alerts/{alert['id']}/acknowledge",
        headers=hospital_headers,
    )
    assert acknowledged.status_code == 200
    assert acknowledged.json()["alert_status"] == "ACKNOWLEDGED"

    capacity = client.patch(
        f"/api/v1/hospitals/{hospital.id}/capacity",
        headers=hospital_headers,
        json={"available_beds": 8},
    )
    assert capacity.status_code == 200
    assert capacity.json()["available_beds"] == 8


def test_capacity_cannot_exceed_total_beds(client, hospital_headers, db):
    hospital = Hospital(
        id=uuid.uuid4(),
        name="Capacity Test Hospital",
        latitude=28.6,
        longitude=77.2,
        total_beds=10,
        available_beds=5,
        is_active=True,
    )
    db.add(hospital)
    db.commit()

    response = client.patch(
        f"/api/v1/hospitals/{hospital.id}/capacity",
        headers=hospital_headers,
        json={"available_beds": 25},
    )
    assert response.status_code == 422
