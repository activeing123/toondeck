"""R15 SPA sentinels: two classes of route regressions pinned mechanically.

1. Deep links: every tab path must serve the SPA shell (200 + index.html).
2. API anti-swallow: EVERY registered GET /api/* route must answer JSON, never
   the SPA shell — a route registered after the catch-all is silently dead and
   this scan is the only thing that catches it.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"

DEEP_LINKS = ["/", "/mcp", "/agents", "/skills", "/logs", "/vault", "/design"]


@pytest.fixture
def spa_client(monkeypatch):
    monkeypatch.setenv("TOONDECK_WEB_DIST", str(WEB_DIST))
    from toondeck.deck.api.app import create_app

    yield TestClient(create_app())


def test_dist_exists():
    assert (WEB_DIST / "index.html").exists(), "pnpm build has not run — dist missing"


@pytest.mark.parametrize("path", DEEP_LINKS)
def test_deep_link_serves_spa_shell(spa_client, path):
    r = spa_client.get(path)
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert '<div id="root"></div>' in r.text, "shell must mount the React root"


def test_asset_like_misses_stay_404(spa_client):
    """The SPA fallback must not fake assets: a missing .js must 404 so the
    browser shows a real error instead of executing HTML as JavaScript."""
    r = spa_client.get("/assets/nope-ghost.js")
    assert r.status_code == 404


def test_every_get_api_route_answers_json_not_html():
    """Auto-scan: register a fresh app, walk its route table, hit every GET
    /api/* path (param routes get a dummy value) and demand JSON. A 200 with
    text/html means the SPA catch-all swallowed a real route."""
    from toondeck.deck.api.app import create_app

    app = create_app()
    client = TestClient(app)
    checked: list[str] = []
    # intentional non-JSON contracts (each entry is a designed B-ticket feature,
    # not a swallow): logs download serves a markdown report by design
    non_json_ok = {"/api/agents/{agent_id}/logs/download": "text/markdown"}

    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api"):
            continue
        if "GET" not in getattr(route, "methods", set()):
            continue
        real = path
        import re

        # param routes: substitute dummies — a miss is fine (404/422 JSON),
        # what must never happen is the HTML shell answering instead
        real = re.sub(r"\{[^}]+\}", "ghost-probe", real)
        r = client.get(real)
        ctype = r.headers.get("content-type", "")
        assert not ctype.startswith("text/html"), (
            f"{path} answered the SPA shell (content-type {ctype}) — "
            "route swallowed by the catch-all; move it above the static mount"
        )
        if r.status_code == 200 and "json" not in ctype:
            expected = non_json_ok.get(path)
            assert expected is not None and ctype.startswith(expected), (
                f"{path} returned 200 {ctype} — API routes must speak JSON "
                f"(or be added to the documented non_json_ok allowlist)"
            )
        checked.append(path)

    assert len(checked) >= 15, (
        f"route scan found only {len(checked)} GET /api routes — the app "
        "factory changed shape and this sentinel needs a look"
    )
