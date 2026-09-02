"""T-002 RED→GREEN: API shell contract tests (pytest, httpx TestClient)."""

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def test_health_endpoint_returns_ok_and_version():
    r = _client().get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert isinstance(body["version"], str) and body["version"]
    assert body["service"] == "toondeck"


def test_health_includes_mcptoon_engine_status():
    """The engine bridge must report whether the mcptoon library is importable."""
    r = _client().get("/api/health")
    assert r.status_code == 200
    engine = r.json()["engine"]
    assert set(engine) >= {"available", "version"}
    assert engine["available"] is True  # mcptoon is installed in the dev env
