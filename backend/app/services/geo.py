"""Small geospatial helpers (plain Python — no PostGIS query needed for the demo)."""

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0

# Simulated average response speed used for ETA estimates.
SIMULATED_SPEED_KMH = 40.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def eta_minutes(distance_km: float) -> int:
    return max(1, round(distance_km / SIMULATED_SPEED_KMH * 60))


def move_towards(
    lat1: float, lon1: float, lat2: float, lon2: float, step_km: float
) -> tuple[float, float, float]:
    """Move a point step_km towards a target. Returns (lat, lon, remaining_km)."""
    total = haversine_km(lat1, lon1, lat2, lon2)
    if total == 0 or total <= step_km:
        return lat2, lon2, 0.0
    fraction = step_km / total
    new_lat = lat1 + (lat2 - lat1) * fraction
    new_lon = lon1 + (lon2 - lon1) * fraction
    return new_lat, new_lon, max(0.0, total - step_km)
