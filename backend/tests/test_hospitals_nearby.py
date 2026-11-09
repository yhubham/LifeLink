import uuid

import pytest

from app.models import Hospital


@pytest.fixture()
def hospitals(db):
    rows = [
        Hospital(
            id=uuid.uuid4(),
            name="Alpha Hospital",
            latitude=28.6000,
            longitude=77.2000,
            specialties=["Trauma"],
            total_beds=50,
            available_beds=10,
            is_active=True,
        ),
        Hospital(
            id=uuid.uuid4(),
            name="Bravo Hospital",
            latitude=28.6100,
            longitude=77.2000,
            specialties=["Cardiology"],
            total_beds=80,
            available_beds=0,
            is_active=True,
        ),
        Hospital(
            id=uuid.uuid4(),
            name="Charlie Clinic",
            latitude=28.7000,
            longitude=77.2000,
            specialties=["Trauma", "Emergency"],
            total_beds=20,
            available_beds=3,
            is_active=True,
        ),
        Hospital(
            id=uuid.uuid4(),
            name="Dormant Hospital",
            latitude=28.6000,
            longitude=77.2000,
            specialties=["Trauma"],
            total_beds=100,
            available_beds=50,
            is_active=False,
        ),
    ]
    for row in rows:
        db.add(row)
    db.commit()
    return {row.name: row for row in rows}


def test_nearby_lists_only_active_sorted_by_name(client, admin_headers, hospitals):
    response = client.get("/api/v1/hospitals/nearby", headers=admin_headers)
    assert response.status_code == 200
    names = [h["name"] for h in response.json()]
    assert names == ["Alpha Hospital", "Bravo Hospital", "Charlie Clinic"]


def test_nearby_ranks_by_distance(client, admin_headers, hospitals):
    response = client.get(
        "/api/v1/hospitals/nearby",
        headers=admin_headers,
        params={"latitude": 28.6, "longitude": 77.2},
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["name"] == "Alpha Hospital"
    assert rows[0]["distance_km"] == 0.0
    distances = [row["distance_km"] for row in rows]
    assert distances == sorted(distances)
    assert rows[0]["eta_minutes"] >= 0


def test_nearby_name_search(client, admin_headers, hospitals):
    response = client.get(
        "/api/v1/hospitals/nearby",
        headers=admin_headers,
        params={"q": "bravo"},
    )
    assert [h["name"] for h in response.json()] == ["Bravo Hospital"]


def test_nearby_specialty_filter(client, admin_headers, hospitals):
    response = client.get(
        "/api/v1/hospitals/nearby",
        headers=admin_headers,
        params={"specialty": "Trauma"},
    )
    assert [h["name"] for h in response.json()] == ["Alpha Hospital", "Charlie Clinic"]


def test_nearby_min_beds_filter(client, admin_headers, hospitals):
    response = client.get(
        "/api/v1/hospitals/nearby",
        headers=admin_headers,
        params={"min_beds": 5},
    )
    assert [h["name"] for h in response.json()] == ["Alpha Hospital"]


def test_nearby_max_distance_filter(client, admin_headers, hospitals):
    response = client.get(
        "/api/v1/hospitals/nearby",
        headers=admin_headers,
        params={
            "latitude": 28.6,
            "longitude": 77.2,
            "max_distance_km": 2,
        },
    )
    assert [h["name"] for h in response.json()] == ["Alpha Hospital", "Bravo Hospital"]


def test_nearby_reports_open_pre_alerts(client, admin_headers, hospitals):
    incident_response = client.post(
        "/api/v1/incidents",
        json={
            "incident_type": "Road accident",
            "latitude": 28.6,
            "longitude": 77.2,
            "patients": [{"display_name": "Test Patient"}],
        },
    )
    assert incident_response.status_code == 201
    incident_id = incident_response.json()["id"]

    alert_response = client.post(
        "/api/v1/hospital-alerts",
        headers=admin_headers,
        json={
            "incident_id": incident_id,
            "hospital_id": str(hospitals["Alpha Hospital"].id),
            "eta_minutes": 7,
        },
    )
    assert alert_response.status_code == 201

    rows = client.get("/api/v1/hospitals/nearby", headers=admin_headers).json()
    counts = {row["name"]: row["open_alerts"] for row in rows}
    assert counts["Alpha Hospital"] == 1
    assert counts["Bravo Hospital"] == 0
