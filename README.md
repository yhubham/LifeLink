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
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# 3. Demo data (idempotent — safe to re-run)
uv run python -m app.seed

# 4. Frontend on :5173
cd ../frontend
npm run dev
```

- App: <http://localhost:5173>
- API docs: <http://127.0.0.1:8000/docs>

## Demo accounts

Password for every account: `Demo@1234`

| Role | Email | Lands on |
|---|---|---|
| Admin | `admin@lifelink.demo` | `/admin/dashboard` |
| Ambulance crew | `crew1@lifelink.demo` | `/ambulance/dashboard` |
| Ambulance crew | `crew2@lifelink.demo` | `/ambulance/dashboard` |
| Hospital desk | `hospital@lifelink.demo` | `/hospital/dashboard` |
| Police control | `police@lifelink.demo` | `/admin/dashboard` |

The seed creates 5 hospitals, 5 ambulances and **10 demo incidents**
(`LL-<year>-0001` … `0010`) with patients and triage records, spread across
REPORTED / VERIFIED / RESPONDING / ARRIVED / CLOSED so every screen has content.
It skips anything that already exists, so re-running is safe.

## Features

- **Public portal** — SOS reporting, incident tracking by public code,
  first-aid guidance, and a one-tap emergency call button.
- **Control room** — live overview, incident verification/closure, ambulance
  dispatch with simulated GPS auto-drive, triage, hospital pre-alerts.
- **Ambulance crew** — active assignments, accept/en-route/arrive/complete,
  simulated movement, patient list.
- **Hospital desk** — incoming pre-alerts, patient priorities, bed capacity.
- **Real-time** — WebSocket channels push incident, dispatch, fleet, alert and
  capacity events to every dashboard. Live badges show connection state and
  auto-reconnect with backoff.
- **Nearest-hospital finder** — every dashboard has a searchable list of
  hospitals ranked by distance, with ETA, available beds, specialties and open
  pre-alert counts. Use *Sort by distance* to rank from the browser's location.

## Tests

```bash
cd backend
uv run pytest -q
```

The suite runs on in-memory SQLite (no Postgres required): authentication and
role checks, WebSocket channel authorization, the full dispatch flow,
triage, pre-alert acknowledgement, capacity validation and hospital-search
filters.

## Structure

- `frontend/` — React + Vite (public portal, admin, ambulance, hospital)
- `backend/` — FastAPI modular monolith (`app/modules/*`)
- `docs/` — architecture, API documentation, demo script

## Mobile

All four dashboards are responsive. Below the `md` breakpoint the sidebar is
replaced by a fixed bottom navigation bar.

## Status

Weeks 1–6 complete: database, auth, reporting, triage/first aid, dispatch,
pre-alerts, real-time updates, responsive layouts, tests and demo data.
See `docs/api-documentation.md` and `docs/demo-guide.md`.
