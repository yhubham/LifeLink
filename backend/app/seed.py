"""Demo seed data for the college demonstration.

Run:  uv run python -m app.seed
Idempotent: skips records that already exist (matched by email/call_sign/name).
"""

import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database.session import SessionLocal
from app.models import (
    Ambulance,
    AmbulanceStatus,
    Hospital,
    User,
    UserRole,
)

DEMO_PASSWORD = "Demo@1234"

USERS = [
    ("Control Room Admin", "admin@lifelink.demo", UserRole.ADMIN),
    ("Ambulance Crew 1", "crew1@lifelink.demo", UserRole.AMBULANCE),
    ("Ambulance Crew 2", "crew2@lifelink.demo", UserRole.AMBULANCE),
    ("City Hospital Desk", "hospital@lifelink.demo", UserRole.HOSPITAL),
    ("Police Control", "police@lifelink.demo", UserRole.POLICE),
]

# name, lat, lon, beds, specialties (Delhi area, simulated)
HOSPITALS = [
    ("AIIMS Delhi", 28.5672, 77.2100, 200, ["Trauma", "Cardiology", "Emergency"]),
    ("Safdarjung Hospital", 28.5686, 77.2057, 150, ["Trauma", "General"]),
    ("Ram Manohar Lohia Hospital", 28.6259, 77.2020, 120, ["Emergency", "Orthopedics"]),
    ("Lady Hardinge Hospital", 28.6250, 77.2060, 90, ["Pediatrics", "Emergency"]),
    ("Batra Hospital", 28.5100, 77.2400, 110, ["Cardiology", "Trauma"]),
]

# call_sign, vehicle_number, lat, lon
AMBULANCES = [
    ("AMB-01", "DL-1-AB-1234", 28.6100, 77.2150),
    ("AMB-02", "DL-1-AB-2345", 28.5800, 77.2300),
    ("AMB-03", "DL-1-AB-3456", 28.6400, 77.1900),
    ("AMB-04", "DL-1-AB-4567", 28.5500, 77.2000),
    ("AMB-05", "DL-1-AB-5678", 28.7000, 77.2500),
]


def seed() -> None:
    db = SessionLocal()
    try:
        for name, email, role in USERS:
            if db.scalar(select(User).where(User.email == email)):
                continue
            db.add(
                User(
                    id=uuid.uuid4(),
                    full_name=name,
                    email=email,
                    password_hash=hash_password(DEMO_PASSWORD),
                    role=role,
                )
            )

        for name, lat, lon, beds, specs in HOSPITALS:
            if db.scalar(select(Hospital).where(Hospital.name == name)):
                continue
            db.add(
                Hospital(
                    id=uuid.uuid4(),
                    name=name,
                    address=name + ", New Delhi",
                    latitude=lat,
                    longitude=lon,
                    specialties=specs,
                    total_beds=beds,
                    available_beds=max(1, beds // 4),
                )
            )

        for call_sign, vehicle, lat, lon in AMBULANCES:
            if db.scalar(select(Ambulance).where(Ambulance.call_sign == call_sign)):
                continue
            db.add(
                Ambulance(
                    id=uuid.uuid4(),
                    call_sign=call_sign,
                    vehicle_number=vehicle,
                    status=AmbulanceStatus.AVAILABLE,
                    latitude=lat,
                    longitude=lon,
                )
            )

        db.commit()
        print("Seed complete.")
        print(f"  Demo login: admin@lifelink.demo / {DEMO_PASSWORD} (and 4 more users)")
        print(f"  Hospitals: {len(HOSPITALS)}  Ambulances: {len(AMBULANCES)}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
