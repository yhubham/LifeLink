PASSWORD = "Demo@1234"


def test_login_success_returns_role_and_token(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@lifelink.demo", "password": PASSWORD},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "ADMIN"
    assert body["full_name"] == "Control Room Admin"
    assert body["access_token"]


def test_login_rejects_bad_password(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@lifelink.demo", "password": "wrong"},
    )
    assert response.status_code == 401


def test_protected_endpoint_requires_token(client):
    response = client.get("/api/v1/incidents")
    assert response.status_code == 401


def test_protected_endpoint_rejects_garbage_token(client):
    response = client.get(
        "/api/v1/incidents", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert response.status_code == 401


def test_ambulance_cannot_create_fleet_unit(client, ambulance_headers):
    response = client.post(
        "/api/v1/ambulances",
        headers=ambulance_headers,
        json={"call_sign": "AMB-X", "vehicle_number": "DL-9-XX-0001"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_ambulance_cannot_change_capacity(client, ambulance_headers, db):
    import uuid

    from app.models import Hospital

    hospital = Hospital(
        id=uuid.uuid4(),
        name="Permission Test Hospital",
        latitude=28.6,
        longitude=77.2,
        total_beds=10,
        available_beds=5,
    )
    db.add(hospital)
    db.commit()

    response = client.patch(
        f"/api/v1/hospitals/{hospital.id}/capacity",
        headers=ambulance_headers,
        json={"available_beds": 1},
    )
    assert response.status_code == 403


def test_admin_can_create_fleet_unit(client, admin_headers):
    response = client.post(
        "/api/v1/ambulances",
        headers=admin_headers,
        json={
            "call_sign": "AMB-T1",
            "vehicle_number": "DL-9-XX-1111",
            "latitude": 28.6,
            "longitude": 77.2,
        },
    )
    assert response.status_code == 201
    assert response.json()["call_sign"] == "AMB-T1"
