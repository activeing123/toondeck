"""Clean-room audit 2026-09-05: the SPA catch-all swallowed unknown /api/* paths.

`GET /api/skills` (a typo for /api/skills/state) answered **200 with index.html**.
For a browser that is indistinguishable from success, so the frontend dies on
`JSON.parse("<!doctype html>")` — the classic "Unexpected token '<'" error that
sends a user hunting for a bug that isn't there. The same swallow already got
called out for /landing in test_landing_page.py; API paths were left open.

Contract: /api/* is a JSON namespace. Anything unmatched there is an honest
404 JSON, never the shell.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


@pytest.mark.parametrize(
    "path",
    [
        "/api/skills",  # real namespace, wrong leaf (the typo case)
        "/api/nonexistent",
        "/api/mcp",
        "/api/agents/bogus/deep/path",
    ],
)
def test_unknown_api_paths_are_json_404_not_the_spa_shell(client, path):
    r = client.get(path)
    assert r.status_code == 404, f"{path} must not answer {r.status_code}"
    assert r.headers["content-type"].startswith("application/json"), (
        f"{path} returned {r.headers['content-type']!r}; a 200 HTML shell here is what "
        "turns a typo into an 'Unexpected token <' crash in the browser"
    )
    assert "<!doctype" not in r.text.lower()


def test_real_api_routes_still_work(client):
    """The guard must not eat live endpoints."""
    for path in ["/api/health", "/api/agents", "/api/skills/state", "/api/mcp/state", "/api/vault/state"]:
        r = client.get(path)
        assert r.status_code == 200, f"{path} -> {r.status_code}"
        assert r.headers["content-type"].startswith("application/json"), path
        r.json()  # must parse


def test_spa_routes_still_get_the_shell(client):
    """Non-API deep links keep the SPA fallback (deep-link refresh must work)."""
    r = client.get("/agents")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
