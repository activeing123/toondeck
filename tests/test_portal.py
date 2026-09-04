"""R53: portal password gate — default admin123, hashed persistence,
env override. The plaintext never lands on disk and never echoes back.
"""

import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def portal_env(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    return tmp_path


def _client() -> TestClient:
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def test_default_password_admin123_seeds_on_first_login(portal_env):
    c = _client()
    st = c.get("/api/portal/state").json()
    assert st["password_gate"] is True and st["seeded"] is False

    assert c.post("/api/portal/login", json={"password": "wrong"}).json()["ok"] is False
    assert c.post("/api/portal/login", json={"password": "admin123"}).json()["ok"] is True

    # first login seeded the hash file — plaintext never written
    pf = portal_env / "portal.json"
    assert pf.is_file()
    blob = pf.read_text(encoding="utf-8")
    assert "admin123" not in blob
    assert "password_sha256" in json.loads(blob)


def test_change_password_roundtrip(portal_env):
    c = _client()
    # wrong current → refused
    r = c.put("/api/portal/password", json={"current": "nope", "new": "hunter22"})
    assert r.json()["ok"] is False
    # right current → new password works, old one dies
    r2 = c.put("/api/portal/password", json={"current": "admin123", "new": "hunter22"})
    assert r2.json()["ok"] is True
    assert c.post("/api/portal/login", json={"password": "admin123"}).json()["ok"] is False
    assert c.post("/api/portal/login", json={"password": "hunter22"}).json()["ok"] is True
    assert c.get("/api/portal/state").json()["seeded"] is True


def test_env_override_wins_and_rejects_file_password(portal_env, monkeypatch):
    monkeypatch.setenv("TOONDECK_PORTAL_PASSWORD", "env-secret-1")
    c = _client()
    c.post("/api/portal/login", json={"password": "admin123"})  # seeds file
    assert c.post("/api/portal/login", json={"password": "env-secret-1"}).json()["ok"] is True
    assert c.post("/api/portal/login", json={"password": "admin123"}).json()["ok"] is False
    assert c.get("/api/portal/state").json()["seeded"] is True


def test_reset_back_to_default(portal_env):
    c = _client()
    c.put("/api/portal/password", json={"current": "admin123", "new": "hunter22"})
    assert c.post("/api/portal/login", json={"password": "admin123"}).json()["ok"] is False
    # forgot password → delete portal.json → factory default again
    (portal_env / "portal.json").unlink()
    assert c.post("/api/portal/login", json={"password": "admin123"}).json()["ok"] is True


def test_password_too_short_refused(portal_env):
    c = _client()
    r = c.put("/api/portal/password", json={"current": "admin123", "new": "abc"})
    assert r.json()["ok"] is False and "short" in r.json()["error"]
