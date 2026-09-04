"""T-031 RED→GREEN: detect_all() public operation + /api/agents routes."""

from fastapi.testclient import TestClient


def test_detect_all_returns_all_first_class_with_summary():
    from toondeck.deck.agents import detect_all

    r = detect_all()
    assert r["total"] == 8  # N-R1: omp joined the first class
    ids = {a["id"] for a in r["agents"]}
    assert ids == {"claude-code", "codex", "cursor", "gemini-cli", "opencode", "catpaw", "dsh", "omp"}
    assert isinstance(r["installed_count"], int)
    for a in r["agents"]:
        assert set(a) >= {"id", "display_name", "installed", "evidence", "config_paths", "tui"}
    by_id = {a["id"]: a for a in r["agents"]}
    assert by_id["codex"]["tui"] is True  # adapter JSON declares TUI (window mode)
    assert by_id["dsh"]["tui"] is True


def test_api_agents_route(engine_env):
    c = TestClient(__import__("toondeck.deck.api.app", fromlist=["create_app"]).create_app())
    r = c.get("/api/agents")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 8
    assert body["installed_count"] >= 0


def test_api_agents_route_not_swallowed_by_spa(engine_env):
    """Regression: dist exists in repo — a missing route must not return index.html."""
    c = TestClient(__import__("toondeck.deck.api.app", fromlist=["create_app"]).create_app())
    r = c.get("/api/agents")
    assert r.headers.get("content-type", "").startswith("application/json")
