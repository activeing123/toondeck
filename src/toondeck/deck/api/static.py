"""deck.api.static — safe SPA hosting: resolve request paths inside web/dist.

Contract (see tests/test_api_static.py):
- no dist root          → None (caller answers 404)
- "/" or "/index.html"  → <dist>/index.html
- existing asset        → the resolved file
- missing file          → None (404; SPA fallback arrives with the real SPA)
- anything outside root → None (path traversal is rejected)
"""

from __future__ import annotations

import os
from pathlib import Path

_INDEX = "index.html"


def _package_webui() -> Path:
    """The SPA shipped inside the installed package (see web/vite.config.ts)."""
    return Path(__file__).resolve().parent / "webui"


def _repo_dist() -> Path:
    """Fallback for a source checkout: web/dist built in place (dev mode)."""
    return Path(__file__).resolve().parents[4] / "web" / "dist"


def landing_page() -> Path | None:
    """R43: the durable landing asset (web/landing/index.html). Static file,
    no build step — the daemon serves it at /landing and any static host can
    serve the same file when toondeck.dev goes live.

    CLEAN-ROOM AUDIT 2026-09-05: resolution used to be repo-relative only, so
    an installed deck answered /landing with 404. Try the packaged copy first.
    """
    env = os.environ.get("TOONDECK_WEB_DIST")
    roots = [Path(env).resolve() / "landing"] if env else [_package_webui() / "landing"]
    if not env:
        roots.append(_repo_dist().parent / "landing")
    for root in roots:
        p = root / _INDEX
        if p.is_file():
            return p
    return None


def _dist_root() -> Path:
    """Locate the frontend dist: env override → the build shipped inside the
    package → a source checkout's web/dist."""
    env = os.environ.get("TOONDECK_WEB_DIST")
    if env:
        return Path(env).resolve()
    packaged = _package_webui()
    if (packaged / _INDEX).is_file():
        return packaged
    # src/toondeck/deck/api/static.py → repo root is 5 parents up
    return _repo_dist()


def resolve(path: str) -> Path | None:
    root = _dist_root()
    if not (root / _INDEX).exists():
        return None
    clean = (path or "").strip("/")
    if not clean:
        return root / _INDEX
    candidate = (root / clean).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    if candidate.is_file():
        return candidate
    # SPA fallback: extensionless misses serve the shell; asset-like misses 404.
    last = clean.rsplit("/", 1)[-1]
    return None if "." in last else root / _INDEX
