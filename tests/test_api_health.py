"""T-013 RED→GREEN: live health probes + token savings (mcptoon's honest math)."""

import json

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def test_health_route_reports_all_servers(engine_env, monkeypatch):
    """Route delegates probing to the engine seam; every configured server gets a verdict."""
    from toondeck.deck.engine import _internal

    fake = [
        {"server": "fetch", "transport": "stdio", "status": "ok", "tools": 3, "latency_ms": 12, "error": None},
        {"server": "github", "transport": "http", "status": "error", "tools": 0, "latency_ms": 5, "error": "refused"},
        {"server": "exa", "transport": "stdio", "status": "timeout", "tools": 0, "latency_ms": 10000, "error": "timeout"},
    ]
    monkeypatch.setattr(_internal, "check_all", lambda **kw: fake)
    r = _client().get("/api/mcp/health")
    assert r.status_code == 200
    body = r.json()
    assert body["checked"] == 3
    assert {x["server"] for x in body["results"]} == {"fetch", "github", "exa"}
    for item in body["results"]:
        assert item["status"] in {"ok", "error", "timeout", "no-config"}


def test_state_includes_token_math_and_cache_ages(engine_env):
    """get_state enriches per-server stats and top-level token savings."""
    c = _client()
    r = c.get("/api/mcp/state")
    assert r.status_code == 200
    body = r.json()
    # per-server enrichments (hermetic cache → empty)
    by = {s["name"]: s for s in body["servers"]}
    assert by["fetch"]["tool_total"] == 0
    assert by["fetch"]["cache_age_s"] is None
    # top-level token math present and coherent
    tm = body["token_savings"]
    assert tm["method"] == "len//4"
    assert tm["tool_total"] == 0
    for k in ("full_json_tokens", "slim_tokens", "saved_pct"):
        assert k in tm
    assert tm["saved_pct"] >= 0
    assert "api/manifest" not in json.dumps(body)  # no live path leaks into state
