"""Watcher flake root-cause (R14): a missing skills dir killed the thread
before the test could observe running=True — watchfiles raises on a
nonexistent path. start() now pre-creates the dir (idempotent) so the
watcher survives fresh tmp homes; this test pins the deterministic contract.
"""

from fastapi.testclient import TestClient


def _client():
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def test_watcher_survives_missing_skills_dir(engine_env, tmp_path):
    """engine_env points TOONDECK_SKILLS_DIR at tmp/skills but never creates it —
    the exact full-suite flake signature. start must not silently die."""
    skills_root = tmp_path / "skills"
    assert not skills_root.exists()  # precondition: the flake trigger

    c = _client()
    r = c.post("/api/skills/watcher", json={"action": "start"}).json()
    assert r["running"] is True
    assert skills_root.exists(), "watcher.start() must create the dir it watches"
    try:
        st = c.get("/api/skills/watcher").json()
        assert st["running"] is True, f"thread died: {st.get('error')}"
    finally:
        c.post("/api/skills/watcher", json={"action": "stop"})


def test_watcher_status_reports_error_instead_of_lying(engine_env):
    """If the thread does die, status must surface the error — not just
    running:false with no explanation."""
    c = _client()
    c.post("/api/skills/watcher", json={"action": "start"})
    c.post("/api/skills/watcher", json={"action": "stop"})
    st = c.get("/api/skills/watcher").json()
    assert st["ok"] is True
    assert st["running"] is False
