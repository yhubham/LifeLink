# LifeLink Architecture

Modular monolith: one FastAPI application divided into independent modules,
served alongside a React + Vite frontend, with PostgreSQL + PostGIS storage.

## Overview

```
React + Vite (localhost:5173)
  Public Portal | Admin | Ambulance | Hospital
        │  REST (axios)              │  WebSocket (JWT or ticket token)
        ▼                            ▼
FastAPI Backend (localhost:8000)
  /api/v1
  ├─ modules/auth        JWT login, role + dashboard grants
  ├─ modules/incidents   SOS reporting, secure tickets, media, timeline
  ├─ modules/patients    observations
  ├─ modules/triage      L1–L4 demo engine
  ├─ modules/first_aid   guidance sessions
  ├─ modules/ambulances  fleet, crew links, assignments, GPS
  ├─ modules/hospitals   OSM discovery, pre-alerts, arrival, capacity
  ├─ modules/calls       WebRTC call metadata + authorization
  └─ modules/realtime    admin/ambulance/hospital/incident/ticket/call sockets
        │
        ▼
PostgreSQL 16 + PostGIS (docker compose, host port 5433)
  users · incidents · incident_events · incident_media · patients
  triage_records · first_aid_sessions · ambulances · ambulance_assignments
  ambulance_locations · hospitals · hospital_alerts · call_sessions
  call_participants · audit_logs
```

Schema changes are managed by Alembic (`backend/migrations/`). The first
revision is a baseline of the Week 1–6 schema; later revisions add secure
tickets, private media metadata, incident events, call sessions, crew links,
dashboard grants and hospital arrival acknowledgement.

## Key decisions

- **One backend, many dashboards** — role-based authorization (JWT + role
  guards) rather than separate services. Easier to test and demonstrate.
- **No Kafka / Redis / Kubernetes** in the demo version — they add operational
  complexity without demonstrating value at this scale.
- **Public reporting needs no account** — a witness can create an incident;
  only reading patient details and managing response requires a staff login.
- **Everything is simulated** — triage is an educational rule engine,
  ambulance movement and hospital capacity are mock data. No real dispatch.

## Incident status workflow

```
REPORTED → VERIFIED → ASSIGNED → RESPONDING → ARRIVED → CLOSED
    └───────────────────────────────────────→ CANCELLED
```

Transitions are guarded server-side: `verify` accepts ADMIN/POLICE,
`close` accepts ADMIN, and invalid transitions return 409.

## Security

- Passwords hashed with Argon2 (pwdlib).
- JWT access tokens (HS256), 30-minute expiry, role claim checked per route.
- `.env` holds secrets and is git-ignored; `.env.example` documents the shape.
- Public tracking endpoint (`GET /incidents/track/{code}`) exposes status only —
  never patient details.
- Ticket PINs are Argon2-hashed; upload tokens are stored as an HMAC-SHA256 keyed
  hash. Neither can be recovered from the database. The PIN is exchanged for a
  signed, short-lived ticket token scoped to one incident.
- Incident media lives outside the web root (`MEDIA_STORAGE_DIR`) and is streamed
  only through an authorized endpoint with `Cache-Control: private, no-store`.
- Dashboard grants are explicit. Non-admin roles cannot widen their dashboard
  scope, and every API route still checks the JWT role.
- Call signaling is participant-checked server-side. TURN secrets stay on the
  backend; with `TURN_SECRET` the API mints per-user short-lived credentials.
- No audio recording. Only call metadata (participants, status, timestamps,
  duration) is stored.

## Realtime and call signaling

The process-local hub (`app/services/realtime.py`) keeps this a single-worker
demo. Staff sockets authenticate with the JWT query parameter; the reporter's
ticket socket uses the signed ticket token; `/ws/calls` is a per-user socket used
for call invitations and SDP/ICE relay. A connected call is closed if its
signaling socket drops, so stale rows never block future calls.

In production this would move to Redis pub/sub and a managed TURN service, but
the authorization model and REST/Voice API contract stay the same.

## Public hospital discovery

`app/services/hospital_discovery.py` calls Overpass with a small cache and maps
upstream timeouts / `429` / `503` / `504` to a readable `503`. Results are real
OSM places, not bed availability. Only a match to a registered LifeLink hospital
attaches live capacity and sets `availability_verified=true`.
