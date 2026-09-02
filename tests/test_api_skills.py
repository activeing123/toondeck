"""T-025 RED→GREEN: skills API routes — thin shell over deck.skills operations."""

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def test_skills_state_route(engine_env):
    d = engine_env / "skills" / "alpha"
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(
        "---\nname: alpha\ndescription: A\n---\nbody", encoding="utf-8"
    )
    r = _client().get("/api/skills/state")
    assert r.status_code == 200
    body = r.json()
    assert body["counts"]["total"] == 1
    assert body["skills"][0]["name"] == "alpha"


def test_skills_sync_route_reports_actions(engine_env, tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_VIEWS_DIR", str(tmp_path / "views"))
    d = engine_env / "skills" / "alpha"
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(
        "---\nname: alpha\ndescription: A\n---\nbody", encoding="utf-8"
    )
    r = _client().post("/api/skills/sync")
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 6
    assert all(x["ok"] for x in results)


def test_skills_doctor_route(engine_env):
    r = _client().get("/api/skills/doctor")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"] in ("ok", "degraded")
    assert len(body["views"]) == 6


def test_skills_remove_route(engine_env, tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_VIEWS_DIR", str(tmp_path / "views"))
    d = engine_env / "skills" / "doomed"
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text("---\nname: doomed\ndescription: D\n---\n", encoding="utf-8")
    r = _client().post("/api/skills/remove", json={"name": "doomed"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
    # unknown skill → clean 200 with ok:false (deck-level error reporting)
    r2 = _client().post("/api/skills/remove", json={"name": "ghost"})
    assert r2.status_code == 200
    assert r2.json()["ok"] is False


def test_skills_watcher_route_lifecycle(engine_env):
    c = _client()
    assert c.post("/api/skills/watcher", json={"action": "start"}).json()["running"] is True
    try:
        assert c.get("/api/skills/watcher").json()["running"] is True
    finally:
        c.post("/api/skills/watcher", json={"action": "stop"})
    assert c.get("/api/skills/watcher").json()["running"] is False
