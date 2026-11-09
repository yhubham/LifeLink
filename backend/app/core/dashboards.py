"""Authorized dashboard grants.

Every account has a default dashboard derived from its role. An administrator
can be explicitly granted additional dashboards through ``User.dashboard_access``
(e.g. ``["admin", "ambulance", "hospital"]``). Non-admin roles are always
limited to their own dashboard, even if a grant is present, so a stray database
row can never widen an operator's scope.
"""

from app.models import User, UserRole

DASHBOARDS = ("admin", "ambulance", "hospital")

DEFAULT_DASHBOARDS = {
    UserRole.ADMIN.value: ["admin"],
    UserRole.POLICE.value: ["admin"],
    UserRole.RESCUE.value: ["admin"],
    UserRole.AMBULANCE.value: ["ambulance"],
    UserRole.HOSPITAL.value: ["hospital"],
}

DASHBOARD_LABELS = {
    "admin": "Admin / Control Room",
    "ambulance": "Ambulance / Responder",
    "hospital": "Hospital",
}

DASHBOARD_HOME = {
    "admin": "/admin/dashboard",
    "ambulance": "/ambulance/dashboard",
    "hospital": "/hospital/dashboard",
}


def allowed_dashboards(user: User) -> list[str]:
    defaults = DEFAULT_DASHBOARDS.get(user.role.value, ["admin"])
    if user.role != UserRole.ADMIN:
        return defaults
    granted = user.dashboard_access or []
    if not isinstance(granted, list):
        return defaults
    allowed = [d for d in granted if d in DASHBOARDS]
    # The admin dashboard is always available to an admin account; additional
    # dashboards require an explicit grant.
    if "admin" not in allowed:
        allowed.insert(0, "admin")
    return allowed


def default_dashboard(user: User) -> str:
    return allowed_dashboards(user)[0]
