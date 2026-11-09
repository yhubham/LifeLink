"""OpenStreetMap hospital discovery through the Overpass API.

Results are advisory only: they come from OSM, not from a hospital's bed
management system. The API therefore labels every row with
``availability_verified=False`` unless it can be matched to a registered
LifeLink hospital that has live capacity data.
"""

from __future__ import annotations

import threading
import time

import httpx

from app.core.config import settings
from app.services.geo import haversine_km

_cache: dict[tuple[float, float, int, int], tuple[float, list[dict]]] = {}
_cache_lock = threading.Lock()


class OverpassUnavailable(RuntimeError):
    """Raised when the public Overpass service cannot answer the query."""


def _cache_key(latitude: float, longitude: float, radius_m: int, limit: int):
    # ~11 m precision is plenty for a discovery search and improves cache hits.
    return (round(latitude, 4), round(longitude, 4), radius_m, limit)


def _address(tags: dict) -> str | None:
    parts = [
        " ".join(
            filter(
                None,
                [tags.get("addr:housenumber"), tags.get("addr:street")],
            )
        ).strip(),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
        tags.get("addr:postcode"),
    ]
    value = ", ".join(part for part in parts if part)
    return value or tags.get("addr:full")


def _contact(tags: dict) -> str | None:
    return (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("emergency:phone")
        or tags.get("contact:mobile")
    )


def _overpass_query(latitude: float, longitude: float, radius_m: int) -> str:
    return f"""
[out:json][timeout:{int(settings.OVERPASS_TIMEOUT_SECONDS)}];
(
  nwr["amenity"="hospital"](around:{radius_m},{latitude},{longitude});
  nwr["healthcare"="hospital"](around:{radius_m},{latitude},{longitude});
);
out center tags;
""".strip()


def discover_hospitals(
    latitude: float,
    longitude: float,
    radius_m: int | None = None,
    limit: int | None = None,
) -> list[dict]:
    radius_m = radius_m or settings.HOSPITAL_DISCOVERY_RADIUS_M
    limit = limit or settings.HOSPITAL_DISCOVERY_LIMIT
    key = _cache_key(latitude, longitude, radius_m, limit)

    with _cache_lock:
        cached = _cache.get(key)
        if cached and time.monotonic() - cached[0] < settings.OVERPASS_CACHE_SECONDS:
            return [dict(row) for row in cached[1]]

    query = _overpass_query(latitude, longitude, radius_m)
    try:
        response = httpx.post(
            settings.OVERPASS_API_URL,
            data={"data": query},
            timeout=settings.OVERPASS_TIMEOUT_SECONDS,
            headers={"User-Agent": "LifeLink/1.0 (college demo; hospital discovery)"},
        )
    except httpx.TimeoutException as exc:
        raise OverpassUnavailable(
            "OpenStreetMap timed out. Please try again."
        ) from exc
    except httpx.HTTPError as exc:
        raise OverpassUnavailable(
            "OpenStreetMap is unavailable right now. Please try again."
        ) from exc

    if response.status_code in (429, 503, 504):
        raise OverpassUnavailable(
            "OpenStreetMap is busy or rate-limiting requests. "
            "Please wait a moment and refresh."
        )
    if response.status_code >= 400:
        raise OverpassUnavailable(
            f"OpenStreetMap returned an error ({response.status_code})."
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise OverpassUnavailable(
            "OpenStreetMap returned an unreadable response."
        ) from exc

    results: list[dict] = []
    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        name = tags.get("name") or tags.get("operator")
        if not name:
            continue
        center = element.get("center") or element
        lat = center.get("lat")
        lon = center.get("lon")
        if lat is None or lon is None:
            continue
        distance_km = haversine_km(latitude, longitude, float(lat), float(lon))
        results.append(
            {
                "osm_id": f"{element.get('type', 'node')}/{element.get('id')}",
                "name": name,
                "latitude": float(lat),
                "longitude": float(lon),
                "distance_km": round(distance_km, 2),
                "address": _address(tags),
                "phone": _contact(tags),
                "website": tags.get("website") or tags.get("contact:website"),
                "emergency": tags.get("emergency") == "yes",
                "operator": tags.get("operator"),
                "discovery_source": "OpenStreetMap",
                "availability_verified": False,
            }
        )

    results.sort(key=lambda row: row["distance_km"])
    results = results[: max(1, min(limit, 50))]

    with _cache_lock:
        _cache[key] = (time.monotonic(), results)
    return [dict(row) for row in results]


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()
