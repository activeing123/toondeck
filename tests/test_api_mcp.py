"""T-012 RED→GREEN: MCP management API routes (thin shell over deck.engine)."""

import json

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def test_get_state_route_returns_engine_state(engine_env):
    r = _client().get("/api/mcp/state")
    assert r.status_code == 200
    body = r.json()
    assert {s["name"] for s in body["servers"]} == {"fetch", "github", "exa"}


def test_toggle_route_roundtrips(engine_env):
    c = _client()
    r = c.post("/api/mcp/toggle", json={"server": "exa", "tool": "websearch"})
    assert r.status_code == 200
    assert r.json() == {"server": "exa", "tool": "websearch", "enabled": False}
    state = c.get("/api/mcp/state").json()
    by = {s["name"]: s for s in state["servers"]}
    assert by["exa"]["disabled_tools"] == ["websearch"]


def test_toggle_route_validates_payload():
    r = _client().post("/api/mcp/toggle", json={"server": "exa"})
    assert r.status_code == 422  # tool missing → pydantic validation


def test_sync_route_returns_results(engine_env, monkeypatch):
    from toondeck.deck import engine

    monkeypatch.setattr(engine, "request_sync", lambda: [{"agent": "claude-code", "ok": True}])
    r = _client().post("/api/mcp/sync")
    assert r.status_code == 200
    assert r.json() == {"results": [{"agent": "claude-code", "ok": True}]}


def test_engine_secrets_never_reach_the_route(engine_env):
    blob = json.dumps(_client().get("/api/mcp/state").json())
    assert "SUPERSECRET" not in blob and "TESTSECRET" not in blob
