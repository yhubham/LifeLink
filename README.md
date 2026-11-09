# LifeLink

Simulated emergency-response ecosystem for a college demonstration.
React + Vite frontend · FastAPI backend · PostgreSQL + PostGIS · WebSockets.

> Everything in this project is a **simulation for education**. No real
> ambulances, hospitals, GPS units or patients are connected.

## Quick start

```bash
# 1. Database (PostgreSQL + PostGIS, host port 5433)
docker compose up -d db

# 2. Backend API on :8000
cd backend
cp .env.example .env          # then set a random JWT_SECRET
uv run alembic upgrade head   # schema migrations
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# 3. Demo data (idempotent — safe to re-run)
uv run python -m app.seed

# 4. Frontend on :5173
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

- App: <http://localhost:5173>
- API docs: <http://127.0.0.1:8000/docs>
- Health: <http://127.0.0.1:8000/api/v1/health>

### Upgrading an existing database

The first Alembic revision is a baseline of the pre-existing schema. On a
database that was created before migrations existed:

```bash
cd backend
uv run alembic stamp 9c84e70c2ee2
uv run alembic upgrade head
uv run python -m app.seed   # backfills demo ticket PINs and crew links
```

## Demo accounts

Password for every account: `Demo@1234`

| Role | Email | Lands on | Dashboards |
|---|---|---|---|
| Admin | `admin@lifelink.demo` | `/admin/dashboard` | Admin, Ambulance, Hospital |
| Ambulance crew | `crew1@lifelink.demo` | `/ambulance/dashboard` | Ambulance |
| Ambulance crew | `crew2@lifelink.demo` | `/ambulance/dashboard` | Ambulance |
| Hospital desk | `hospital@lifelink.demo` | `/hospital/dashboard` | Hospital |
| Police control | `police@lifelink.demo` | `/admin/dashboard` | Admin |

The admin account is **explicitly granted** the ambulance and hospital
dashboards for the demo. Non-admin roles can never widen their own scope; the
backend re-checks every API call with the account's role.

Seeded incidents (`LL-<year>-0001` … `0010`) use the demo ticket PIN
**`246810`** so the public ticket page can be demonstrated repeatably. Reports
created in the app receive a random one-time PIN, shown only on the success
screen.

## Features

- **Public portal** — SOS reporting, secure ticket tracking, first-aid guidance.
  The report form has clear required markers, incident type, description,
  automatic timestamp, GPS/manual/map-pin location, landmark, injured count,
  optional patient details and up to 12 private photos.
- **Nearby hospitals** — live Geoapify Places discovery (`healthcare.hospital`)
  nearest-first, with distance, address, coordinates, contact, website and map.
  The report page starts at 5 km and can expand to 10 km or 20 km; clicking a
  hospital focuses it on the OpenStreetMap map. Discovered rows are clearly
  labelled **availability not verified**; only registered LifeLink hospitals
  expose live bed counts. API timeouts, rate limits and invalid-key errors
  degrade gracefully and the report can still be submitted.
- **Secure tickets** — a unique ticket number plus a one-time PIN (stored only
  as an Argon2 hash) and an opaque upload token (stored only as a keyed hash).
  The PIN unlocks a short-lived signed ticket token on any device. Public
  timelines contain operational status only — never patient data.
- **Private media** — JPG/PNG/WebP only, size/type/count validation on both
  client and server, private server storage, and authenticated access limited
  to control-room staff or the crew/hospital attached to the incident. Images
  are never public and never sent to external AI services.
- **Voice calling** — admin ↔ assigned responder, voice-only WebRTC with
  accept/reject, mute, duration, end and explicit Calling/Ringing/Connected/
  Rejected/Ended/Failed states. SDP/ICE uses the existing FastAPI WebSocket
  layer; STUN is built in and TURN credentials can be minted per user. No audio
  is recorded; call metadata is persisted for history.
- **Control room** — live overview, incident verification/closure, dispatch
  with simulated GPS auto-drive, triage, pre-alerts, photos, call responder and
  the incident map.
- **Ambulance crew** — crew-targeted assignments, accept/en-route/arrive/
  complete, simulated movement, patient details, scene photos, navigation link
  and call control room.
- **Hospital desk** — incoming pre-alerts, patient priorities, pre-alert
  acknowledgement, patient-arrival acknowledgement and bed capacity.
- **Dashboard switcher** — every staff layout shows the active dashboard. Only
  authorized dashboards appear; direct URLs are blocked by the route guard and
  by backend RBAC.
- **Real-time** — channels for admin, ambulance, hospital, incident, ticket and
  per-user call signaling. Live badges reconnect with exponential backoff.

## Tests

```bash
cd backend
uv run pytest -q

cd ../frontend
npm run build
npm run lint
```

The backend suite runs on in-memory SQLite (no Postgres required) and covers
authentication/roles, WebSocket authorization, the dispatch flow, triage,
pre-alert acknowledgement, capacity validation, hospital search, OSM discovery,
secure ticket access, media authorization and call lifecycle rules.

## Structure

- `frontend/` — React + Vite (public portal, admin, ambulance, hospital)
- `backend/` — FastAPI modular monolith (`app/modules/*`) + Alembic migrations
- `docs/` — architecture, API documentation, demo script

## Mobile

All four dashboards are responsive. Below the `md` breakpoint the sidebar is
replaced by a fixed bottom navigation bar, and the dashboard switcher and call
widget adapt to the smaller viewport.

## Status

Weeks 1–7 complete: database, auth, reporting, triage/first aid, dispatch,
pre-alerts, real-time updates, responsive layouts, OSM hospital discovery,
secure tickets/media, WebRTC voice, dashboard grants, tests and demo data.
See `docs/api-documentation.md` and `docs/demo-guide.md`.
