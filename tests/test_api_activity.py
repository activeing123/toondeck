"""R45: /api/activity route + journal instrumentation of deck actions."""

from pathlib import Path

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def _journal_file(engine_env) -> Path:
    from toondeck.deck.journal import journal_path

    return journal_path()


def test_activity_route_empty(engine_env):
    r = _client().get("/api/activity")
    assert r.status_code == 200
    assert r.json() == {"events": []}


def test_activity_route_limit_clamped(engine_env):
    from toondeck.deck import journal

    for i in range(5):
        journal.record("t.tick", i=i)
    r = _client().get("/api/activity", params={"limit": 2})
    body = r.json()["events"]
    assert len(body) == 2
    assert body[0]["i"] == 4  # newest first
    # untrusted limit clamps, never explodes
    r2 = _client().get("/api/activity", params={"limit": 99999})
    assert r2.status_code == 200
    r3 = _client().get("/api/activity", params={"limit": 0})
    assert r3.json()["events"] == []


def test_skills_sync_is_journaled(engine_env, tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_VIEWS_DIR", str(tmp_path / "views"))
    d = engine_env / "skills" / "alpha"
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text("---\nname: alpha\ndescription: A\n---\nb", encoding="utf-8")
    _client().post("/api/skills/sync")
    _client().post("/api/skills/sync/ghost")  # failure is journalled too
    events = _client().get("/api/activity").json()["events"]
    by = {e["event"]: e for e in events}
    assert by["skills.sync"]["ok"] == 6  # six agent views
    assert by["skills.sync_one"]["ok"] is False
    assert by["skills.sync_one"]["name"] == "ghost"


def test_agent_launch_failure_is_journalled(engine_env):
    _client().post("/api/agents/ghost-agent/launch")
    events = _client().get("/api/activity").json()["events"]
    launch = next(e for e in events if e["event"] == "agent.launch")
    assert launch["agent"] == "ghost-agent"
    assert launch["ok"] is False
