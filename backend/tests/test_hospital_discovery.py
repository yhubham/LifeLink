import uuid

import httpx
import pytest

from app.core.config import settings
from app.models import Hospital
from app.services import hospital_discovery as discovery


@pytest.fixture(autouse=True)
def _geoapify_key(monkeypatch):
    discovery.clear_cache()
    monkeypatch.setattr(settings, "GEOAPIFY_API_KEY", "test-geoapify-key")
    yield
    discovery.clear_cache()


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


def _feature(
    name,
    latitude,
    longitude,
    *,
    place_id=None,
    formatted=None,
    phone=None,
    website=None,
):
    properties = {
        "place_id": place_id or f"place-{name or latitude}",
        "lat": latitude,
        "lon": longitude,
    }
    if name is not None:
        properties["name"] = name
    if formatted:
        properties["formatted"] = formatted
    if phone:
        properties["contact"] = {"phone": phone}
    if website:
        properties["datasource"] = {"raw": {"website": website}}
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
    }


def _geoapify_payload():
    return {
        "type": "FeatureCollection",
        "features": [
            _feature(
                "Further Hospital",
                28.62,
                77.22,
                place_id="further",
                formatted="Main Road, New Delhi",
                phone="+91 11 0000 0002",
            ),
            _feature(
                "Nearest Hospital",
                28.6135,
                77.2095,
                place_id="nearest",
                formatted="Ring Road, New Delhi",
                website="https://nearest.example",
            ),
            _feature(None, 28.6140, 77.2100, place_id="unnamed"),
            {
                "type": "Feature",
                "properties": {"name": "No Coordinates Hospital", "place_id": "none"},
                "geometry": {"type": "Point", "coordinates": []},
            },
        ],
    }


def _stub(monkeypatch, response=None, error=None):
    def fake_get(*args, **kwargs):
        if error is not None:
            raise error
        return response

    monkeypatch.setattr(discovery.httpx, "get", fake_get)


def test_discovery_returns_sorted_geoapify_rows(client, monkeypatch):
    _stub(monkeypatch, FakeResponse(payload=_geoapify_payload()))

    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "Geoapify Places API"
    assert body["category"] == "healthcare.hospital"
    assert body["radius_m"] == 5000
    assert body["center"] == {"latitude": 28.6139, "longitude": 77.209}
    assert body["count"] == 3

    names = [row["name"] for row in body["results"]]
    assert names[0] == "Nearest Hospital"
    assert names[1] == "Unnamed hospital"
    assert names[2] == "Further Hospital"
    assert [row["distance_km"] for row in body["results"]] == sorted(
        row["distance_km"] for row in body["results"]
    )

    nearest = body["results"][0]
    assert nearest["place_id"] == "nearest"
    assert nearest["address"] == "Ring Road, New Delhi"
    assert nearest["phone"] is None
    assert nearest["website"] == "https://nearest.example"
    assert nearest["latitude"] == 28.6135
    assert nearest["longitude"] == 77.2095
    assert 0 < nearest["distance_km"] < 0.2
    assert nearest["discovery_source"] == "Geoapify"
    assert nearest["availability_verified"] is False

    further = body["results"][2]
    assert further["phone"] == "+91 11 0000 0002"
    assert "not verified" in body["availability_note"]


def test_discovery_handles_missing_details(client, monkeypatch):
    _stub(monkeypatch, FakeResponse(payload=_geoapify_payload()))

    body = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    ).json()
    unnamed = next(row for row in body["results"] if row["place_id"] == "unnamed")
    assert unnamed["name"] == "Unnamed hospital"
    assert unnamed["address"] is None
    assert unnamed["phone"] is None


def test_discovery_links_registered_hospital_capacity(client, db, monkeypatch):
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
    _stub(monkeypatch, FakeResponse(payload=_geoapify_payload()))

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


def test_discovery_sends_radius_and_coordinates_to_geoapify(client, monkeypatch):
    captured = {}

    def fake_get(*args, **kwargs):
        captured.update(kwargs.get("params") or {})
        return FakeResponse(payload={"features": []})

    monkeypatch.setattr(discovery.httpx, "get", fake_get)
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209, "radius": 10000},
    )
    assert response.status_code == 200, response.text
    assert response.json()["count"] == 0
    assert response.json()["radius_m"] == 10000
    assert captured["filter"] == "circle:77.209,28.6139,10000"
    assert captured["categories"] == "healthcare.hospital"
    assert captured["limit"] == 50
    assert captured["apiKey"] == "test-geoapify-key"


def test_discovery_validates_coordinates_and_radius(client):
    for params in (
        {"latitude": 95, "longitude": 77.2},
        {"latitude": 28.6, "longitude": 181},
        {"latitude": 28.6, "longitude": 77.2, "radius": 100},
        {"latitude": 28.6, "longitude": 77.2, "radius": 25000},
    ):
        response = client.get("/api/v1/hospitals/discover", params=params)
        assert response.status_code == 422, params


def test_discovery_maps_timeouts_to_503(client, monkeypatch):
    _stub(monkeypatch, error=httpx.TimeoutException("timed out"))
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 503
    assert "timed out" in response.json()["detail"].lower()

    travel = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert travel.status_code == 503


def test_discovery_maps_network_errors_to_503(client, monkeypatch):
    _stub(monkeypatch, error=httpx.ConnectError("network down"))
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 503
    assert "reach" in response.json()["detail"].lower()


def test_discovery_maps_invalid_api_key_to_502(client, monkeypatch):
    _stub(monkeypatch, FakeResponse(status_code=401))
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 502
    assert "api key" in response.json()["detail"].lower()


def test_discovery_maps_rate_limit_to_503(client, monkeypatch):
    _stub(monkeypatch, FakeResponse(status_code=429))
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 503
    assert "rate" in response.json()["detail"].lower()


def test_discovery_requires_server_api_key(client, monkeypatch):
    monkeypatch.setattr(settings, "GEOAPIFY_API_KEY", "")
    response = client.get(
        "/api/v1/hospitals/discover",
        params={"latitude": 28.6139, "longitude": 77.209},
    )
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()
