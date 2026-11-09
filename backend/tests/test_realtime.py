import asyncio

import pytest
from starlette.websockets import WebSocketDisconnect

from app.services.realtime import ConnectionManager


def _token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Demo@1234"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_admin_channel_accepts_admin_and_sends_connected(client):
    token = _token(client, "admin@lifelink.demo")
    with client.websocket_connect(f"/api/v1/ws/admin?token={token}") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "connected"
        assert message["channel"] == "admin"


def test_ambulance_channel_accepts_crew(client):
    token = _token(client, "crew1@lifelink.demo")
    with client.websocket_connect(f"/api/v1/ws/ambulance?token={token}") as websocket:
        assert websocket.receive_json()["channel"] == "ambulance"


def test_channel_rejects_wrong_role(client):
    token = _token(client, "crew1@lifelink.demo")
    with pytest.raises(WebSocketDisconnect), client.websocket_connect(
        f"/api/v1/ws/admin?token={token}"
    ):
        pass


def test_channel_rejects_missing_token(client):
    with pytest.raises(WebSocketDisconnect), client.websocket_connect(
        "/api/v1/ws/admin"
    ):
        pass


def test_incident_channel_requires_any_staff_token(client):
    token = _token(client, "hospital@lifelink.demo")
    with client.websocket_connect(
        f"/api/v1/ws/incidents/00000000-0000-0000-0000-000000000000?token={token}"
    ) as websocket:
        message = websocket.receive_json()
        assert message["type"] == "connected"
        assert message["channel"].startswith("incidents/")


def test_call_signaling_socket_is_not_shadowed_by_channel_route(client):
    token = _token(client, "admin@lifelink.demo")
    with client.websocket_connect(
        f"/api/v1/ws/calls?token={token}"
    ) as websocket:
        message = websocket.receive_json()
        assert message["type"] == "connected"
        assert message["channel"].startswith("user/")


class FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.sent = []

    async def accept(self):
        self.accepted = True

    async def send_json(self, message):
        self.sent.append(message)


def test_connection_manager_tracks_and_broadcasts():
    async def scenario():
        manager = ConnectionManager()
        ws_one = FakeWebSocket()
        ws_two = FakeWebSocket()

        await manager.connect(ws_one, "admin")
        await manager.connect(ws_two, "admin")
        assert manager.subscriber_count("admin") == 2
        assert ws_one.accepted and ws_one.sent[0]["type"] == "connected"

        await manager._send("admin", {"type": "incident.created", "payload": {}})
        assert ws_two.sent[-1]["type"] == "incident.created"

        manager.disconnect(ws_one, "admin")
        assert manager.subscriber_count("admin") == 1
        manager.disconnect(ws_two, "admin")
        assert manager.subscriber_count("admin") == 0

    asyncio.run(scenario())
