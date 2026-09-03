"""R43 ⑧ — the product landing page is a repo asset, not a memory.

The 09-02 approved A-version design (dark glass, Toon workshop) existed only
as session output and was lost. This file is the durable re-landing: a single
static HTML page (no build step) served by the daemon at /landing and ready
for any static host when toondeck.dev goes live (DNS = user decision).
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

LANDING = Path(__file__).resolve().parents[1] / "web" / "landing" / "index.html"


@pytest.fixture
def client():
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def test_landing_file_exists_and_is_standalone():
    assert LANDING.is_file(), "web/landing/index.html is the durable landing asset"
    html = LANDING.read_text(encoding="utf-8")
    assert "<title>" in html and "ToonDeck" in html
    # single file = zero external resource dependencies (outbound <a> links
    # to pypi/github are fine; remote scripts/styles/images are not)
    import re

    externals = re.findall(
        r'<(?:script[^>]+src|link[^>]+href|img[^>]+src)\s*=\s*"[^"]*"',
        html,
        flags=re.IGNORECASE,
    )
    assert externals == [], f"landing must not depend on remote resources: {externals}"


def test_landing_route_serves_the_page(client):
    r = client.get("/landing")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "ToonDeck" in r.text


def test_landing_is_not_the_spa_shell(client):
    """The landing page is its own document — the SPA catch-all must not
    answer /landing with index.html (that would be a swallow, silently)."""
    r = client.get("/landing")
    assert '<div id="root"></div>' not in r.text, "/landing must serve the landing page, not the shell"
