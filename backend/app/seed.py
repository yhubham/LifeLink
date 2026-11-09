"""Demo seed data for the college demonstration.

Run:  uv run python -m app.seed
Idempotent: skips records that already exist (matched by email/call_sign/name).
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.security import hash_password, hash_pin
from app.database.session import SessionLocal
from app.models import (
    Ambulance,
    AmbulanceStatus,
    Hospital,
    Incident,
    IncidentEvent,
    IncidentStatus,
    Patient,
    PriorityLevel,
    TriageRecord,
    User,
    UserRole,
)

DEMO_PASSWORD = "Demo@1234"
# All seeded demo tickets share this PIN so the college demo is repeatable.
# Runtime reports still receive a random one-time PIN.
DEMO_TICKET_PIN = "246810"

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

# Ten incidents for the Week 6 demo. Codes are LL-<year>-0001..0010, so the
# seed is idempotent and runtime reports continue after these.
# patients: (name, age, consciousness, breathing, bleeding, priority, reason)
DEMO_INCIDENTS = [
    {
        "suffix": 1,
        "incident_type": "Road accident",
        "description": "Two-wheeler vs auto-rickshaw collision near the ITO crossing.",
        "latitude": 28.6289,
        "longitude": 77.2405,
        "address": "Ring Road, ITO, New Delhi",
        "status": IncidentStatus.CLOSED,
        "minutes_ago": 620,
        "patients": [
            ("Ravi Kumar", 34, "alert", "normal", "moderate", PriorityLevel.L2, "Road traffic trauma"),
            ("Sunita Devi", 41, "confused", "fast", "severe", PriorityLevel.L1, "Suspected internal bleeding"),
        ],
    },
    {
        "suffix": 2,
        "incident_type": "Cardiac emergency",
        "description": "Middle-aged man collapsed at a bus stop with chest pain.",
        "latitude": 28.6448,
        "longitude": 77.2167,
        "address": "Connaught Place, New Delhi",
        "status": IncidentStatus.CLOSED,
        "minutes_ago": 540,
        "patients": [
            ("Mohan Lal", 58, "unresponsive", "absent", "none", PriorityLevel.L1, "Cardiac arrest — CPR indicated"),
        ],
    },
    {
        "suffix": 3,
        "incident_type": "Fire injury",
        "description": "Kitchen fire in a residential block; two occupants with burns.",
        "latitude": 28.5921,
        "longitude": 77.2270,
        "address": "Lajpat Nagar II, New Delhi",
        "status": IncidentStatus.CLOSED,
        "minutes_ago": 480,
        "patients": [
            ("Anjali Sharma", 29, "alert", "normal", "none", PriorityLevel.L2, "Partial-thickness burns"),
            ("Deepak Verma", 35, "alert", "fast", "none", PriorityLevel.L2, "Smoke inhalation"),
        ],
    },
    {
        "suffix": 4,
        "incident_type": "Fall from height",
        "description": "Construction worker fell from the second floor of a site.",
        "latitude": 28.5355,
        "longitude": 77.2410,
        "address": "Nehru Place, New Delhi",
        "status": IncidentStatus.VERIFIED,
        "minutes_ago": 250,
        "patients": [
            ("Imran Khan", 26, "confused", "normal", "moderate", PriorityLevel.L2, "Possible limb fracture"),
        ],
    },
    {
        "suffix": 5,
        "incident_type": "Breathing difficulty",
        "description": "Elderly woman with acute breathlessness at home.",
        "latitude": 28.6692,
        "longitude": 77.2265,
        "address": "Civil Lines, New Delhi",
        "status": IncidentStatus.VERIFIED,
        "minutes_ago": 180,
        "patients": [
            ("Kamla Bai", 72, "alert", "fast", "none", PriorityLevel.L2, "Acute respiratory distress"),
        ],
    },
    {
        "suffix": 6,
        "incident_type": "Assault",
        "description": "Street altercation with a laceration to the forearm.",
        "latitude": 28.6517,
        "longitude": 77.1909,
        "address": "Karol Bagh, New Delhi",
        "status": IncidentStatus.VERIFIED,
        "minutes_ago": 130,
        "patients": [
            ("Rahul Singh", 23, "alert", "normal", "severe", PriorityLevel.L3, "Controlled bleeding, needs sutures"),
        ],
    },
    {
        "suffix": 7,
        "incident_type": "Drowning",
        "description": "Teenager pulled from a community pool and is coughing water.",
        "latitude": 28.5729,
        "longitude": 77.1650,
        "address": "Vasant Kunj, New Delhi",
        "status": IncidentStatus.RESPONDING,
        "minutes_ago": 95,
        "patients": [
            ("Aarav Mehta", 15, "alert", "fast", "none", PriorityLevel.L2, "Near-drowning, observe airway"),
        ],
    },
    {
        "suffix": 8,
        "incident_type": "Electrical shock",
        "description": "Worker contacted a live wire at a market stall.",
        "latitude": 28.7041,
        "longitude": 77.1025,
        "address": "Rohini Sector 7, New Delhi",
        "status": IncidentStatus.ARRIVED,
        "minutes_ago": 70,
        "patients": [
            ("Suresh Yadav", 39, "unresponsive", "weak", "none", PriorityLevel.L1, "High-voltage exposure — monitor rhythm"),
        ],
    },
    {
        "suffix": 9,
        "incident_type": "Building collapse",
        "description": "A single-storey structure partially collapsed after excavation work.",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "address": "Paharganj, New Delhi",
        "status": IncidentStatus.REPORTED,
        "minutes_ago": 35,
        "patients": [
            ("Unknown male (1)", None, "unresponsive", "weak", "severe", PriorityLevel.L1, "Crush injury — extrication needed"),
            ("Unknown female (2)", None, "confused", "normal", "moderate", PriorityLevel.L2, "Trapped under debris"),
            ("Unknown child (3)", None, "alert", "normal", "none", PriorityLevel.L3, "Abrasion, conscious"),
        ],
    },
    {
        "suffix": 10,
        "incident_type": "Stroke",
        "description": "Sudden facial droop and slurred speech reported by family.",
        "latitude": 28.5800,
        "longitude": 77.1600,
        "address": "Munirka, New Delhi",
        "status": IncidentStatus.REPORTED,
        "minutes_ago": 15,
        "patients": [
            ("Prakash Chandra", 66, "confused", "normal", "none", PriorityLevel.L2, "Stroke pathway — time critical"),
        ],
    },
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
        db.flush()

        # The control-room admin is explicitly authorized for all three
        # dashboards so the switcher can be demonstrated. Crew/hospital
        # accounts stay limited to their own role dashboard.
        admin = db.scalar(
            select(User).where(User.email == "admin@lifelink.demo")
        )
        if admin is not None and not admin.dashboard_access:
            admin.dashboard_access = ["admin", "ambulance", "hospital"]

        crew_links = {
            "AMB-01": "crew1@lifelink.demo",
            "AMB-02": "crew2@lifelink.demo",
        }
        crew_ids = {}
        for email in crew_links.values():
            crew = db.scalar(select(User).where(User.email == email))
            if crew is not None:
                crew_ids[email] = crew.id

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
            crew_email = crew_links.get(call_sign)
            crew_id = crew_ids.get(crew_email) if crew_email else None
            existing = db.scalar(
                select(Ambulance).where(Ambulance.call_sign == call_sign)
            )
            if existing is not None:
                if crew_id is not None and existing.crew_user_id is None:
                    existing.crew_user_id = crew_id
                continue
            db.add(
                Ambulance(
                    id=uuid.uuid4(),
                    call_sign=call_sign,
                    vehicle_number=vehicle,
                    status=AmbulanceStatus.AVAILABLE,
                    latitude=lat,
                    longitude=lon,
                    crew_user_id=crew_id,
                )
            )

        year = datetime.now(UTC).year
        incidents_created = 0
        for spec in DEMO_INCIDENTS:
            public_code = f"LL-{year}-{spec['suffix']:04d}"
            existing = db.scalar(
                select(Incident).where(Incident.public_code == public_code)
            )
            if existing is not None:
                # Backfill demo ticket access for rows created before the
                # secure-ticket feature existed.
                if existing.ticket_pin_hash is None:
                    existing.ticket_pin_hash = hash_pin(DEMO_TICKET_PIN)
                    existing.ticket_created_at = existing.reported_at
                continue

            reported_at = datetime.now(UTC) - timedelta(
                minutes=spec["minutes_ago"]
            )
            incident = Incident(
                id=uuid.uuid4(),
                public_code=public_code,
                incident_type=spec["incident_type"],
                description=spec["description"],
                latitude=spec["latitude"],
                longitude=spec["longitude"],
                address=spec["address"],
                landmark=spec.get("landmark"),
                injured_count=len(spec["patients"]),
                status=spec["status"],
                reported_at=reported_at,
                closed_at=(
                    reported_at + timedelta(minutes=45)
                    if spec["status"] == IncidentStatus.CLOSED
                    else None
                ),
                ticket_pin_hash=hash_pin(DEMO_TICKET_PIN),
                ticket_created_at=reported_at,
            )
            db.add(incident)
            db.flush()
            db.add(
                IncidentEvent(
                    id=uuid.uuid4(),
                    incident_id=incident.id,
                    event_type="reported",
                    message="Incident reported",
                    status=IncidentStatus.REPORTED.value,
                    created_at=reported_at,
                )
            )

            for (
                name,
                age,
                consciousness,
                breathing,
                bleeding,
                priority,
                reason,
            ) in spec["patients"]:
                patient = Patient(
                    id=uuid.uuid4(),
                    incident_id=incident.id,
                    display_name=name,
                    age=age,
                    consciousness=consciousness,
                    breathing=breathing,
                    bleeding=bleeding,
                )
                db.add(patient)
                db.flush()
                db.add(
                    TriageRecord(
                        id=uuid.uuid4(),
                        patient_id=patient.id,
                        priority_level=priority.value,
                        protocol="demo-sim-v1",
                        assessment_answers={
                            "airway": consciousness != "unresponsive" and "clear",
                            "breathing_rate": breathing,
                            "circulation": "weak" if bleeding in ("severe", "moderate") else "normal",
                            "ambulatory": "yes" if priority.value in ("L3", "L4") else "no",
                        },
                        reason=reason,
                        created_at=reported_at + timedelta(minutes=4),
                    )
                )

            incidents_created += 1

        db.commit()
        print("Seed complete.")
        print(f"  Demo login: admin@lifelink.demo / {DEMO_PASSWORD} (and 4 more users)")
        print(f"  Demo ticket PIN for seeded incidents: {DEMO_TICKET_PIN}")
        print(
            f"  Hospitals: {len(HOSPITALS)}  Ambulances: {len(AMBULANCES)}  "
            f"Demo incidents: {len(DEMO_INCIDENTS)} (+{incidents_created} new)"
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed()
