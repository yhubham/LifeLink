# LifeLink — demo & presentation guide

A 10–12 minute walkthrough for the college demo. Everything is simulated; say so
early and often.

## Before the audience arrives

```bash
docker compose up -d db
cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
cd backend && uv run python -m app.seed          # idempotent
cd frontend && npm run dev
```

Open two browser windows side by side:

1. **Control room** — `admin@lifelink.demo`
2. **Hospital desk** — `hospital@lifelink.demo`

Password for both: `Demo@1234`. Use a third window or a phone-sized viewport for
the crew dashboard (`crew1@lifelink.demo`).

Check that each dashboard header shows a green **LIVE** badge. If it shows
**SYNCING**, the WebSocket is reconnecting — wait a few seconds or restart the
backend.

## Script

### 1. Public SOS (1 min)

- Landing page → **Emergency** / **Report an incident**.
- Fill the form (type, location, one patient) and submit.
- Note the generated public code (`LL-2026-00xx`) and the tracking page.
- Point out the floating call button.

### 2. Control room (3 min)

- The new incident appears on the **Overview** without refreshing — this is the
  WebSocket push (`incident.created`).
- Open the incident → **Verify**.
- Dispatch an available ambulance → **Auto-drive**.
- Watch the distance/ETA tick down; the crew and incident pages update live.
- At arrival the incident flips to **ARRIVED**.

### 3. Nearest-hospital finder (2 min)

- On the **Overview** scroll to *Nearest hospitals*.
- Type a name, pick a specialty, set a minimum bed count — the list filters as
  you type.
- Click **Sort by distance** and allow location access (or just show the seeded
  Delhi coordinates). Rows show km, ETA, beds and **inbound** alerts.
- Change a hospital's capacity in the hospital window → the finder badge count
  and bed numbers refresh live (`hospital.capacity_updated`).

### 4. Pre-alert (2 min)

- In the incident, send a **pre-alert** to the nearest hospital.
- The hospital desk receives it instantly (red *open* counter, patient
  priorities from triage).
- Acknowledge it → the control room sees `ACKNOWLEDGED` live.

### 5. Ambulance crew (1 min)

- Sign in as `crew1@lifelink.demo`.
- Show active assignments, accept, start en route, simulate/auto-drive, complete.
- Point out the crew's *Hospitals near the incident* panel.

### 6. Mobile (1 min)

- Resize to a phone width. Sidebars collapse to a bottom tab bar on all four
  dashboards; tables and cards wrap without horizontal scrolling.

### 7. Wrap-up (1 min)

- Mention the test suite: `uv run pytest -q` → 25 tests on in-memory SQLite.
- Mention security: JWT auth, role-based endpoints, WebSocket channel roles.
- Mention limits: in-process WebSocket hub (single worker), simulated GPS and
  bed counts, no media upload.

## Reset / clean slate

The seed is additive and idempotent. To start over:

```bash
docker compose down -v && docker compose up -d db
cd backend && uv run python -m app.seed
```

`down -v` deletes the database volume. Only do this when you do not need the
current demo incidents.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard stuck on *Loading…* | Focus the browser tab; background tabs throttle timers/WebSockets. |
| **SYNCING** never turns green | Backend restarted? Reload the page; check the token in `localStorage`. |
| UI ignores code edits | Stop Vite, delete `frontend/node_modules/.vite`, restart. |
| `no such table` in backend | Run the seed after the API has started once (tables are created on startup). |
| Port 5433 busy | `docker compose ps`; adjust the published port in `docker-compose.yml`. |
