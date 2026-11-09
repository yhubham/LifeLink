# LifeLink API Documentation

Base URL: `http://127.0.0.1:8000/api/v1`
Interactive docs: `http://127.0.0.1:8000/docs`

Authentication: `Authorization: Bearer <token>` (from `POST /auth/login`).

## Auth

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| POST | `/auth/login` | — | Staff login → JWT |
| GET | `/auth/me` | any staff | Current user |
| POST | `/auth/logout` | any staff | Token discarded client-side |
| POST | `/auth/users` | ADMIN | Create staff user |

Roles: `ADMIN`, `AMBULANCE`, `HOSPITAL`, `POLICE`, `RESCUE`.

## Incidents

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| POST | `/incidents` | — (public) | Create incident + patients (SOS) |
| GET | `/incidents/track/{code}` | — (public) | Status only, no patient data |
| GET | `/incidents` | staff | List (optional `?incident_status=`) |
| GET | `/incidents/{id}` | staff | Detail incl. patients |
| PATCH | `/incidents/{id}` | ADMIN | Status change |
| POST | `/incidents/{id}/verify` | ADMIN, POLICE | REPORTED → VERIFIED |
| POST | `/incidents/{id}/close` | ADMIN | → CLOSED |
| POST | `/incidents/{id}/patients` | staff | Add patient |
| GET | `/incidents/{id}/patients` | staff | List patients |

Example: create incident

```json
POST /api/v1/incidents
{
  "incident_type": "Road Accident",
  "description": "Two-car collision near AIIMS gate",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "address": "AIIMS Flyover, New Delhi",
  "patients": [
    {"display_name": "Rahul", "age": 34,
     "consciousness": "Confused", "breathing": "Normal", "bleeding": "Heavy"}
  ]
}
```

Response `201`:

```json
{
  "id": "uuid",
  "public_code": "LL-2026-0001",
  "status": "REPORTED",
  "latitude": 28.6139,
  "longitude": 77.209
}
```

## Triage and first aid

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| POST | `/patients/{id}/triage` | staff | Run demo engine → L1–L4, stores history |
| GET | `/patients/{id}/triage` | staff | Assessment history (newest first) |
| GET | `/patients/{id}/guidance` | — (public) | Priority-matched first-aid steps |
| POST | `/patients/{id}/guidance/sessions` | — (public) | Start guidance session |
| PATCH | `/guidance/sessions/{id}` | — (public) | Update completed steps |

Triage engine: `app/services/triage_engine.py` (protocol `demo-sim-v1`,
START-inspired educational rules — clearly labelled as a simulation).
Guidance content: `app/services/first_aid_content.py`.

Example: `POST /patients/{id}/triage`

```json
{"answers": {"airway": "clear", "breathing_rate": "fast",
             "circulation": "weak", "ambulatory": "no"}}
```

Response:

```json
{"priority_level": "L2", "label": "Urgent (yellow)",
 "reason": "Urgent: Respiratory rate > 30/min; Weak peripheral pulse.",
 "protocol": "demo-sim-v1"}
```

## Not yet implemented (planned weeks 4–6)

Patient detail/patch endpoints, media uploads, ambulances,
assignments, GPS updates, hospitals, capacity, hospital alerts, WebSocket
channels (`/ws/admin`, `/ws/ambulance`, `/ws/hospital`, `/ws/incidents/{id}`).

## Error codes

- `401` missing/invalid token
- `403` insufficient role
- `404` not found
- `409` invalid status transition / duplicate email
- `422` validation error (FastAPI/pydantic detail array)
