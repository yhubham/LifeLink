# LifeLink Architecture

Modular monolith: one FastAPI application divided into independent modules,
served alongside a React + Vite frontend, with PostgreSQL + PostGIS storage.

## Overview

```
React + Vite (localhost:5173)
  Public Portal | Admin | Ambulance | Hospital
        │  REST (axios)              │  WebSocket (planned, Week 6)
        ▼                            ▼
FastAPI Backend (localhost:8000)
  /api/v1
  ├─ modules/auth        JWT login, role-based access
  ├─ modules/incidents   SOS reporting, status workflow
  ├─ modules/patients    observations            (Week 2)
  ├─ modules/triage      L1–L4 demo engine       (Week 3)
  ├─ modules/first_aid   guidance sessions       (Week 3)
  ├─ modules/ambulances  fleet, assignments, GPS (Week 5)
  ├─ modules/hospitals   pre-alerts, capacity    (Week 5)
  └─ modules/notifications                       (Week 5–6)
        │
        ▼
PostgreSQL 16 + PostGIS (docker compose, host port 5433)
  users · incidents · patients · triage_records · incident_media
  first_aid_sessions · ambulances · ambulance_assignments
  ambulance_locations · hospitals · hospital_alerts · audit_logs
```

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
