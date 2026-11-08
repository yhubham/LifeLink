# LifeLink

Simulated emergency-response ecosystem for a college demonstration.
React + Vite frontend · FastAPI backend · PostgreSQL + PostGIS · WebSockets.

## Quick start

```bash
docker compose up -d db          # PostgreSQL + PostGIS on :5432
cd backend && uv run fastapi dev app/main.py   # API on :8000
cd frontend && npm run dev       # UI on :5173
```

API docs: http://127.0.0.1:8000/docs

## Structure

- `frontend/` — React + Vite (public portal, admin, ambulance, hospital dashboards)
- `backend/` — FastAPI modular monolith (`app/modules/*`)
- `docs/` — architecture, database schema, API documentation

## Status

Phase 1 — setup, database, authentication, incident creation.
