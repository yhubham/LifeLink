"""Minimal in-process WebSocket hub.

The demo runs a single uvicorn worker, so a process-local registry of
connections is enough. Routers are synchronous (FastAPI runs them in a
threadpool), so `publish()` hands work back to the event loop captured during
startup with `bind_loop()`.
"""

import asyncio
from collections import defaultdict
from datetime import UTC, datetime

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self) -> None:
        self._loop = asyncio.get_running_loop()

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        await websocket.accept()
        self._channels[channel].add(websocket)
        await websocket.send_json(
            {"type": "connected", "channel": channel, "at": _now()}
        )

    def disconnect(self, websocket: WebSocket, channel: str) -> None:
        self._channels[channel].discard(websocket)
        if not self._channels[channel]:
            self._channels.pop(channel, None)

    def subscriber_count(self, channel: str) -> int:
        return len(self._channels.get(channel, ()))

    async def _send(self, channel: str, message: dict) -> None:
        for websocket in list(self._channels.get(channel, ())):
            try:
                await websocket.send_json(message)
            except Exception:  # noqa: BLE001 - drop broken sockets
                self.disconnect(websocket, channel)

    def publish(
        self, channels: str | list[str], event: str, payload: dict | None = None
    ) -> None:
        """Thread-safe broadcast. Safe to call from sync or async code."""
        if isinstance(channels, str):
            channels = [channels]
        message = {"type": event, "payload": payload or {}, "at": _now()}
        loop = self._loop
        if loop is None or not loop.is_running():
            return
        for channel in channels:
            if channel:
                asyncio.run_coroutine_threadsafe(
                    self._send(channel, message), loop
                )


def _now() -> str:
    return datetime.now(UTC).isoformat()


manager = ConnectionManager()
publish = manager.publish
