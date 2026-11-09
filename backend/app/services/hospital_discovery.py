"""Nearby hospital discovery through the Geoapify Places API.

Geoapify serves places from OpenStreetMap and other providers. Results are
advisory: bed availability is not verified unless a place can be matched to a
registered LifeLink hospital with live capacity data.

The API key is read from ``GEOAPIFY_API_KEY`` on the server and is never sent
to a browser.
"""

from __future__ import annotations

import threading
import time

import httpx

from app.core.config import settings
from app.services.geo import haversine_km

_CACHE_TTL_SECONDS = 120
_cache: dict[tuple[float, float, int, int], tuple[float, list[dict]]] = {}
_cache_lock = threading.Lock()


class HospitalDiscoveryUnavailable(RuntimeError):
    """Raised when Geoapify cannot answer a hospital-discovery query."""

    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


def _cache_key(latitude: float, longitude: float, radius_m: int, limit: int):
    # ~11 m precision is plenty for a discovery search and improves cache hits.
    return (round(latitude, 4), round(longitude, 4), radius_m, limit)


def _coords(feature: dict) -> tuple[float, float] | None:
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates") or []
    latitude = longitude = None
    if isinstance(coordinates, (list, tuple)) and len(coordinates) >= 2:
        longitude, latitude = coordinates[0], coordinates[1]
    properties = feature.get("properties") or {}
    if latitude is None:
        latitude = properties.get("lat")
    if longitude is None:
        longitude = properties.get("lon")
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None
    return latitude, longitude


def _raw(properties: dict) -> dict:
    datasource = properties.get("datasource") or {}
    raw = datasource.get("raw") or {}
    return raw if isinstance(raw, dict) else {}


def _address(properties: dict) -> str | None:
    raw = _raw(properties)
    formatted = (
        properties.get("formatted")
        or properties.get("address_line2")
        or properties.get("address_line1")
    )
    if formatted:
        return str(formatted).strip() or None
    parts = [
        " ".join(
            filter(None, [raw.get("housenumber"), raw.get("street")])
        ).strip(),
        raw.get("suburb") or raw.get("district"),
        raw.get("city"),
        raw.get("postcode"),
    ]
    value = ", ".join(part for part in parts if part)
    return value or None


def _contact_value(properties: dict, keys: tuple[str, ...]) -> str | None:
    contact = properties.get("contact") or {}
    raw = _raw(properties)
    sources = (properties, contact if isinstance(contact, dict) else {}, raw)
    for source in sources:
        for key in keys:
            value = source.get(key)
            if value:
                text = str(value).strip()
                if text:
                    return text
    return None


def _phone(properties: dict) -> str | None:
    return _contact_value(
        properties,
        ("phone", "contact:phone", "emergency:phone", "mobile", "contact:mobile"),
    )


def _website(properties: dict) -> str | None:
    return _contact_value(properties, ("website", "contact:website", "url"))


def _feature_row(feature: dict, latitude: float, longitude: float) -> dict | None:
    point = _coords(feature)
    if point is None:
        return None
    properties = feature.get("properties") or {}
    raw = _raw(properties)
    name = (
        properties.get("name")
        or raw.get("name")
        or _address(properties)
        or "Unnamed hospital"
    )
    name = str(name).strip()[:200] or "Unnamed hospital"
    place_id = str(
        properties.get("place_id") or raw.get("osm_id") or f"{name}:{point}"
    )
    address = _address(properties)
    distance_km = haversine_km(latitude, longitude, point[0], point[1])
    return {
        "place_id": place_id,
        "name": name,
        "latitude": round(point[0], 6),
        "longitude": round(point[1], 6),
        "distance_km": round(distance_km, 2),
        "address": address[:500] if address else None,
        "phone": _phone(properties),
        "website": _website(properties),
        "discovery_source": "Geoapify",
        "availability_verified": False,
    }


def discover_hospitals(
    latitude: float,
    longitude: float,
    radius_m: int | None = None,
    limit: int | None = None,
) -> list[dict]:
    """Return nearby hospitals, nearest first.

    Raises :class:`HospitalDiscoveryUnavailable` with a safe, user-facing
    message for configuration, timeout, network and upstream errors.
    """
    radius_m = int(radius_m or settings.HOSPITAL_DISCOVERY_RADIUS_M)
    limit = max(1, min(int(limit or settings.HOSPITAL_DISCOVERY_LIMIT), 50))

    if not settings.GEOAPIFY_API_KEY.strip():
        raise HospitalDiscoveryUnavailable(
            "Hospital search is not configured on the server. "
            "Set GEOAPIFY_API_KEY in backend/.env.",
            status_code=503,
        )

    key = _cache_key(latitude, longitude, radius_m, limit)
    ttl = settings.GEOAPIFY_CACHE_SECONDS or _CACHE_TTL_SECONDS
    with _cache_lock:
        cached = _cache.get(key)
        if cached and time.monotonic() - cached[0] < ttl:
            return [dict(row) for row in cached[1]]

    params = {
        "categories": settings.GEOAPIFY_CATEGORY,
        "filter": f"circle:{longitude},{latitude},{radius_m}",
        "bias": f"proximity:{longitude},{latitude}",
        "limit": limit,
        "apiKey": settings.GEOAPIFY_API_KEY,
    }
    try:
        response = httpx.get(
            settings.GEOAPIFY_API_URL,
            params=params,
            timeout=settings.GEOAPIFY_TIMEOUT_SECONDS,
            headers={"User-Agent": "LifeLink/1.0 (hospital discovery)"},
        )
    except httpx.TimeoutException as exc:
        raise HospitalDiscoveryUnavailable(
            "Hospital search timed out. Please try again.", status_code=503
        ) from exc
    except httpx.HTTPError as exc:
        raise HospitalDiscoveryUnavailable(
            "Could not reach the hospital search service. "
            "Check your connection and try again.",
            status_code=503,
        ) from exc

    if response.status_code in (401, 403):
        raise HospitalDiscoveryUnavailable(
            "Hospital search is misconfigured: the Geoapify API key is invalid "
            "or unauthorized.",
            status_code=502,
        )
    if response.status_code == 429:
        raise HospitalDiscoveryUnavailable(
            "Hospital search is rate-limited right now. "
            "Please wait a moment and refresh.",
            status_code=503,
        )
    if response.status_code >= 400:
        raise HospitalDiscoveryUnavailable(
            f"Hospital search service returned an error "
            f"({response.status_code}). Please try again.",
            status_code=502,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise HospitalDiscoveryUnavailable(
            "Hospital search returned an unreadable response. Please try again.",
            status_code=502,
        ) from exc

    features = payload.get("features")
    if not isinstance(features, list):
        raise HospitalDiscoveryUnavailable(
            "Hospital search returned an unexpected response. Please try again.",
            status_code=502,
        )

    rows: list[dict] = []
    seen: set[str] = set()
    for feature in features:
        if not isinstance(feature, dict):
            continue
        row = _feature_row(feature, latitude, longitude)
        if row is None or row["place_id"] in seen:
            continue
        seen.add(row["place_id"])
        rows.append(row)

    rows.sort(key=lambda row: row["distance_km"])
    rows = rows[:limit]

    with _cache_lock:
        _cache[key] = (time.monotonic(), rows)
    return [dict(row) for row in rows]


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()
