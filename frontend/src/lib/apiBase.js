// LifeLink API base.
//
// Deployed, the frontend and backend share one origin: Vercel routes /api/*
// to the FastAPI service (see vercel.json). Locally, the Vite dev server
// proxies /api (including WebSocket upgrades) to the backend on :8000.
// VITE_API_URL remains an optional escape hatch for pointing the app at a
// different backend entirely.
export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

/**
 * WebSocket base derived from the HTTP API base.
 *
 * Handles relative bases such as "/api/v1" by resolving them against the
 * current origin, so the same code works behind the Vercel rewrite and behind
 * the local Vite proxy.
 *
 * @returns {string} e.g. "wss://example.vercel.app/api/v1"
 */
export function wsBase() {
  const url = new URL(API_BASE, window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString().replace(/\/$/, '')
}
