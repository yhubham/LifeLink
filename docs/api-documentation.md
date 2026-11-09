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
| GET | `/incidents/stats` | staff | Control-room counters (status totals, 24 h) |
| GET | `/patients/{id}` | staff | Patient detail + incident + latest triage |

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

## Ambulances and dispatch

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| GET | `/ambulances` | staff | Fleet list with status + last GPS |
| POST | `/ambulances` | ADMIN | Register a unit |
| POST | `/ambulances/{id}/location` | ADMIN, AMBULANCE | Manual GPS update (logs history) |
| GET | `/assignments` | staff | List (`?incident_id=`, `?active_only=`) |
| POST | `/assignments` | ADMIN | Dispatch an available ambulance |
| GET | `/assignments/mine` | AMBULANCE, ADMIN | Active assignments for the crew view |
| PATCH | `/assignments/{id}` | ADMIN, AMBULANCE | `ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → COMPLETED` (or `CANCELLED`) |
| POST | `/assignments/{id}/simulate-step` | ADMIN, AMBULANCE | Move the unit 0.8 km toward the incident |

`simulate-step` returns the new position, remaining `distance_km`, `eta_minutes`
(at a simulated 40 km/h) and `arrived`. Arrival flips the assignment and the
incident to `ARRIVED`. GPS movement is simulated for the demo — no real vehicles.

Status side effects: dispatching sets the ambulance `ASSIGNED`; `EN_ROUTE` sets
`RESPONDING`; `ARRIVED` sets `ON_SCENE`; `COMPLETED`/`CANCELLED` free the unit.

Demo shortcut: there is no crew→ambulance link in the schema, so
`/assignments/mine` returns every active assignment in the simulated fleet.

## Hospitals and pre-alerts

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| GET | `/hospitals` | staff | Facilities with mock capacity |
| GET | `/hospitals/match` | staff | Active hospitals with beds, nearest first (`?latitude=&longitude=&min_beds=&limit=`) |
| PATCH | `/hospitals/{id}/capacity` | ADMIN, HOSPITAL | Update total/available beds |
| POST | `/hospital-alerts` | ADMIN, AMBULANCE | Send a pre-alert (ETA + message) |
| GET | `/hospital-alerts/incoming` | staff | Open alerts (`?include_acknowledged=true` for all) |
| POST | `/hospital-alerts/{id}/acknowledge` | HOSPITAL, ADMIN | Accept the incoming patient |

`match` adds `distance_km` (haversine) and `eta_minutes` (simulated 40 km/h).
Alerts embed the incident and its patients with latest triage priority. Only one
open alert per incident/hospital pair (`409` on duplicates). Bed counts are mock
data for the demonstration.

## Public call button

Every public page (landing, emergency, report, track, guidance) shows a floating
`tel:` button. The number is a single constant,
`EMERGENCY_CALL_NUMBER` in `frontend/src/components/common/CallButton.jsx` —
currently `859505879` exactly as supplied (9 digits; update the constant if the
full number differs).

## Not yet implemented (planned week 6)

WebSocket channels (`/ws/admin`, `/ws/ambulance`, `/ws/hospital`,
`/ws/incidents/{id}`), media uploads, API test suite, deployment.

## Error codes

- `401` missing/invalid token
- `403` insufficient role
- `404` not found
- `409` invalid status transition / duplicate email
- `422` validation error (FastAPI/pydantic detail array)
