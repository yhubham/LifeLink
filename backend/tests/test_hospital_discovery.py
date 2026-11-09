import uuid

import httpx

from app.models import Hospital
from app.services import hospital_discovery as discovery


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


def _overpass_payload():
    return {
        "elements": [
            {
                "type": "node",
                "id": 2,
                "lat": 28.62,
                "lon": 77.22,
                "tags": {
                    "name": "Further Hospital",
                    "amenity": "hospital",
                    "addr:street": "Main Road",
                    "addr:city": "New Delhi",
                    "phone": "+91 11 0000 0002",
                },
            },
            {
                "type": "way",
                "id": 1,
                "center": {"lat": 28.6135, "lon": 77.2095},
                "tags": {
                    "name": "Nearest Hospital",
                    "healthcare": "hospital",
                    "website": "https://nearest.example",
                },
            },
            {
                "type": "node",
                "id": 3,
                "lat": 28.6136,
                "lon": 77.2096,
                "tags": {"amenity": "hospital"},
            },
        ]
    }


def test_discovery_returns_sorted_unverified_osm_rows(client, monkeypatch):
    discovery.clear_cache()
    monkeypatch.setattr(
        discovery.httpx,
        "post",
        lambda *args, **kwargs: FakeResponse(payload=_overpass_payload()),
    )

    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209, "radius_m": 5000},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "OpenStreetMap / Overpass"
    assert body["count"] == 2
    names = [row["name"] for row in body["results"]]
    assert names == ["Nearest Hospital", "Further Hospital"]
    assert all(row["availability_verified"] is False for row in body["results"])
    first = body["results"][0]
    assert 0 < first["distance_km"] < 0.2
    assert first["website"] == "https://nearest.example"
    assert body["results"][1]["phone"] == "+91 11 0000 0002"
    assert "not verified" in body["availability_note"]


def test_discovery_links_registered_hospital_capacity(client, db, monkeypatch):
    discovery.clear_cache()
    hospital = Hospital(
        id=uuid.uuid4(),
        name="Nearest Hospital",
        address="Delhi",
        latitude=28.6135,
        longitude=77.2095,
        total_beds=100,
        available_beds=12,
        specialties=["Trauma"],
    )
    db.add(hospital)
    db.commit()
    monkeypatch.setattr(
        discovery.httpx,
        "post",
        lambda *args, **kwargs: FakeResponse(payload=_overpass_payload()),
    )

    body = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    ).json()
    matched = next(
        row for row in body["results"] if row["name"] == "Nearest Hospital"
    )
    assert matched["availability_verified"] is True
    assert matched["registered_hospital_id"] == str(hospital.id)
    assert matched["available_beds"] == 12


def test_discovery_maps_timeouts_to_503(client, monkeypatch):
    discovery.clear_cache()

    def raise_timeout(*args, **kwargs):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(discovery.httpx, "post", raise_timeout)
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 503
    assert "timed out" in response.json()["detail"].lower()


def test_discovery_maps_rate_limit_to_503(client, monkeypatch):
    discovery.clear_cache()
    monkeypatch.setattr(
        discovery.httpx,
        "post",
        lambda *args, **kwargs: FakeResponse(status_code=429),
    )
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 503
    assert "rate" in response.json()["detail"].lower()
