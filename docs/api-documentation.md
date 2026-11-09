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

### Dashboard access

`POST /auth/login` and `GET /auth/me` return `user_id`, `dashboards` and
`default_dashboard`. Defaults are: admin/police/rescue → admin; ambulance →
ambulance; hospital → hospital. An admin may be explicitly granted more than one
dashboard via `users.dashboard_access` (e.g. `["admin","ambulance","hospital"]`).
Non-admin accounts are always limited to their own dashboard even if a database
row contains a grant. The frontend hides unauthorized dashboards and blocks
direct URLs; the API independently enforces the role on every endpoint.

## Incidents

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| POST | `/incidents` | — (public) | Create incident + patients (SOS); returns one-time ticket PIN/token |
| GET | `/incidents/track/{code}` | — (public) | Status only, no patient data |
| POST | `/incidents/ticket/access` | — (public) | Exchange ticket number + PIN for a short-lived ticket token |
| GET | `/incidents/ticket/{code}` | ticket token | Ticket detail + safe timeline (no patient data) |
| POST | `/incidents/{id}/media` | ticket token | Upload one private incident photo |
| GET | `/incidents/{id}/media` | attached staff | List photo metadata for an incident |
| GET | `/incidents/{id}/media/{media_id}/file` | attached staff | Stream the private image (never public) |
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
  "incident_type": "Road accident",
  "description": "Two-car collision near AIIMS gate",
  "latitude": 28.6139,
  "longitude": 77.2090,
  "address": "AIIMS Flyover, New Delhi",
  "landmark": "Opposite the metro station",
  "injured_count": 2,
  "preferred_hospital": {
    "osm_id": "node/123456",
    "name": "AIIMS Delhi",
    "latitude": 28.5672,
    "longitude": 77.2100,
    "distance_km": 5.1,
    "availability_verified": false
  },
  "patients": [
    {"display_name": "Rahul", "age": 34,
     "consciousness": "Confused", "breathing": "Normal", "bleeding": "Heavy"}
  ]
}
```

`description` is optional at the API level for backward compatibility, but the
web form requires it. `preferred_hospital` records a preference only — it is
never a confirmed bed reservation.

Response `201` (the three credential fields are returned **once** and only
hashes are stored):

```json
{
  "id": "uuid",
  "public_code": "LL-2026-0011",
  "status": "REPORTED",
  "latitude": 28.6139,
  "longitude": 77.209,
  "injured_count": 2,
  "access_token": "opaque-upload-token",
  "access_pin": "123456",
  "ticket_token": "signed-short-lived-token"
}
```

## Secure tickets and media

The reporter never needs an account. On creation they receive:

- `public_code` (ticket number, e.g. `LL-2026-0011`)
- `access_pin` (6-digit one-time PIN, Argon2-hashed at rest)
- `access_token` (opaque upload token, keyed-hash at rest)
- `ticket_token` (signed, short-lived token for immediate viewing)

Later, on any device:

```json
POST /api/v1/incidents/ticket/access
{"public_code": "LL-2026-0011", "pin": "123456"}
```

→ `{ticket_token, expires_in_minutes, ticket}`. Send the token as
`Authorization: Bearer <ticket_token>` to
`GET /incidents/ticket/{code}`. It contains ticket number, type, description,
address/landmark, coordinates, reported time, status, injured/patient counts,
preferred hospital, assigned ambulance, hospital pre-alert and a **safe**
timeline. Patient medical details are never included.

Ticket tokens carry `scope: "ticket"` and cannot be used as staff access
tokens; staff endpoints reject them with `401`. After 5 incorrect PINs for the
same ticket number within 15 minutes the exchange returns `429` with a
`Retry-After` header, even if the following PIN is correct. A successful unlock
clears the counter. (The limiter is process-local; use Redis for multi-worker
deployments.)

Photo upload uses the upload token exactly once per request:

```
POST /api/v1/incidents/{id}/media?patient_id=<optional>
X-Ticket-Token: <access_token>
Content-Type: multipart/form-data  (field: file)
```

Server-side rules: JPG/PNG/WebP only, magic-byte check, 10 MB per file,
12 files per incident, private storage under `MEDIA_STORAGE_DIR`. Staff can
list/stream photos only if they are an admin, the assigned crew (matched through
`Ambulance.crew_user_id`) or the hospital that received the incident pre-alert.
Responses use `Cache-Control: private, no-store`.

`GET /incidents/ticket/{code}` is public in the sense that it needs no staff
account, but it rejects requests without a valid signed ticket token.

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
| POST | `/ambulances` | ADMIN | Register a unit (optional `crew_user_id`) |
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

Crews are matched through `Ambulance.crew_user_id`. Seeded units `AMB-01` and
`AMB-02` are linked to `crew1` and `crew2`. Legacy rows with no crew link remain
visible to ambulance accounts so the demo keeps working; new dispatches still
target the unit selected by the control room.

## Hospitals and pre-alerts

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| GET | `/hospitals` | staff | Facilities with mock capacity + `open_alerts` |
| GET | `/hospitals/discover` | — (public) | OpenStreetMap/Overpass discovery near coordinates |
| GET | `/hospitals/nearby` | staff | Real-time finder: filters + nearest-first ranking (`?latitude=&longitude=&q=&specialty=&min_beds=&max_distance_km=&limit=`) |
| GET | `/hospitals/match` | staff | Active hospitals with beds, nearest first (`?latitude=&longitude=&min_beds=&limit=`) |
| PATCH | `/hospitals/{id}/capacity` | ADMIN, HOSPITAL | Update total/available beds |
| POST | `/hospital-alerts` | ADMIN, AMBULANCE | Send a pre-alert (ETA + message) |
| GET | `/hospital-alerts/incoming` | staff | Open alerts (`?include_acknowledged=true` for all) |
| POST | `/hospital-alerts/{id}/acknowledge` | HOSPITAL, ADMIN | Accept the incoming patient |
| POST | `/hospital-alerts/{id}/arrival` | HOSPITAL, ADMIN | Confirm the patient physically arrived at the hospital |

`GET /hospitals/discover?latitude=&longitude=&radius_m=&limit=` is the public
report-page search. It calls Overpass with a cache and maps upstream `429/503/504`
to a readable `503`. Every row carries `discovery_source: "OpenStreetMap"` and
`availability_verified: false`; a row is upgraded to verified only when it can
be matched to a registered hospital with live capacity data.

`POST /hospital-alerts/{id}/arrival` is accepted once the incident is `ARRIVED`
or `CLOSED`; otherwise it returns `409`. It is idempotent.

`/hospitals/nearby` powers the dashboard finder panel. It returns **active**
hospitals only, filters by name (`q`), specialty, `min_beds` and
`max_distance_km`, then sorts by distance when coordinates are supplied. Each
row includes:

```json
{
  "id": "uuid",
  "name": "AIIMS Delhi",
  "specialties": ["Trauma", "Cardiology", "Emergency"],
  "total_beds": 200,
  "available_beds": 50,
  "open_alerts": 1,
  "distance_km": 1.59,
  "eta_minutes": 2
}
```

`match` adds `distance_km` (haversine) and `eta_minutes` (simulated 40 km/h).
Alerts embed the incident and its patients with latest triage priority. Only one
open alert per incident/hospital pair (`409` on duplicates). Bed counts are mock
data for the demonstration.

## Voice calls

Voice-only WebRTC. The REST API persists call state; `/ws/calls` relays SDP/ICE
and call notifications. No audio is recorded or stored.

| Method | Endpoint | Auth | Function |
|---|---|---|---|
| GET | `/calls/ice-config` | any staff | STUN/TURN ICE servers for this user |
| POST | `/calls` | ADMIN, POLICE, RESCUE, AMBULANCE | Start a call for an incident |
| GET | `/calls/active` | any staff | Calls this user is currently part of |
| GET | `/calls/history` | any staff | Recent calls (`?incident_id=`), ambulance users only see their own |
| GET | `/calls/{id}` | participant | Call metadata |
| POST | `/calls/{id}/accept` | receiver | Accept and connect |
| POST | `/calls/{id}/reject` | receiver | Reject |
| POST | `/calls/{id}/end` | participant | End a connected/ringing call |
| POST | `/calls/{id}/failed` | participant | Mark the call failed (e.g. microphone denied) |

Authorization is derived from the incident assignment:

- Control room can call **only** the crew account linked to the assigned
  ambulance (`409` if the unit has no crew account).
- A crew member can call the control room, and only for an incident assigned to
  their own unit.
- Only the two participants may fetch a call, end it, or relay SDP/ICE.
- Only the receiver can accept or reject.
- One active call per incident (`409` while one is ringing/connected).

Statuses: `CALLING`, `RINGING`, `CONNECTED`, `REJECTED`, `ENDED`, `FAILED`.
Fields persisted: `incident_id`, `caller_id`, `receiver_id`, `room`, `status`,
`started_at`, `ringing_at`, `connected_at`, `ended_at`, `duration_seconds`,
`end_reason`, plus participant join/leave timestamps.

TURN: set `TURN_URLS` and either static `TURN_USERNAME`/`TURN_CREDENTIAL`
(development only) or the recommended `TURN_SECRET` for coturn REST-style
short-lived per-user credentials. No TURN secret is ever sent to the browser.

## Realtime WebSockets

Base: `ws://127.0.0.1:8000/api/v1/ws/...`. Authenticate with the same JWT via a
query parameter because browsers cannot set headers on WebSocket handshakes:

```
ws://127.0.0.1:8000/api/v1/ws/admin?token=<JWT>
```

| Channel | Allowed roles | Used by |
|---|---|---|
| `/ws/admin` | ADMIN, POLICE, RESCUE | Control-room dashboard, incident list |
| `/ws/ambulance` | AMBULANCE, ADMIN | Crew dashboard |
| `/ws/hospital` | HOSPITAL, ADMIN | Hospital dashboard, alerts, capacity |
| `/ws/incidents/{id}` | any staff | Incident detail (admin + crew views) |
| `/ws/tickets/{incident_id}` | signed ticket token | Reporter's public ticket page |
| `/ws/calls` | any staff | Per-user call notifications + SDP/ICE relay |

`/ws/tickets/{id}` uses the signed ticket token in `?token=` instead of a staff
JWT and only receives that incident's safe events. `/ws/calls` is a per-user
socket; the server verifies that the sender is a participant of the call before
relaying `call.offer`, `call.answer` or `call.ice`. Signaling payloads are never
persisted.

The server sends a `connected` frame on subscribe, then event frames:

```json
{"type": "assignment.updated", "payload": {"incident_id": "uuid", "status": "EN_ROUTE"}, "at": "2026-11-09T10:00:00+00:00"}
```

Events published today: `incident.created`, `incident.updated`,
`incident.media_added`, `assignment.updated`, `ambulance.moved`,
`fleet.updated`, `patient.added`, `hospital.alert`,
`hospital.alert_acknowledged`, `hospital.arrival_acknowledged`,
`hospital.capacity_updated`, and call events `call.invite`, `call.accepted`,
`call.rejected`, `call.ended`, `call.failed`. Incident/dispatch/hospital events
are also published to `tickets/{incident_id}` so the reporter's open ticket
updates live.
Clients send a periodic `ping` text frame to keep the socket alive; the frontend
reconnects automatically with exponential backoff.

> The hub is process-local (`app/services/realtime.py`) and intended for the
> single-worker demo. A production deployment would use Redis pub/sub.

## Testing

```bash
cd backend
uv run pytest -q
```

The suite uses in-memory SQLite (no Postgres required) and covers login/roles,
WebSocket channel auth, the full dispatch → arrived → complete flow, triage,
pre-alert acknowledgement, capacity validation, `/hospitals/nearby` filters,
OSM discovery (mocked upstream), secure ticket PIN/token access, private media
authorization and call lifecycle/participant rules.

## Public call button

Every public page (landing, emergency, report, track, guidance) shows a floating
`tel:` button. The number is a single constant,
`EMERGENCY_CALL_NUMBER` in `frontend/src/components/common/CallButton.jsx` —
currently `859505879` exactly as supplied (9 digits; update the constant if the
full number differs).

## Error codes

- `401` missing/invalid token, wrong ticket PIN/token, ticket token used as a
  staff token
- `403` insufficient role or not attached to the incident/call
- `404` not found
- `409` invalid status transition / duplicate email / open pre-alert exists /
  active call already exists / no crew account for the assigned unit
- `413` uploaded image exceeds `MEDIA_MAX_BYTES`
- `415` unsupported image type
- `422` validation error (FastAPI/pydantic detail array)
- `429` too many incorrect ticket PIN attempts (see `Retry-After`)
- `503` OpenStreetMap discovery is busy, rate-limited or unavailable
