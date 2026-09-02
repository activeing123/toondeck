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


def _dist_root() -> Path:
    """Locate the frontend dist. Env override first, then repo-relative default."""
    env = os.environ.get("TOONDECK_WEB_DIST")
    if env:
        return Path(env).resolve()
    # src/toondeck/deck/api/static.py → repo root is 5 parents up
    default = Path(__file__).resolve().parents[4] / "web" / "dist"
    return default


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
    return candidate if candidate.is_file() else None
