"""R56 ⑨ — the committed SPA must match the sources that produced it.

CI already fails when `web/dist` is stale, but only by rebuilding and diffing
inside the workflow. The local suite could not see drift at all: a hand-edited
`web/landing/index.html` shipped once and CI caught it only after the push.
This test closes that hole in the suite itself, with two checks that need no
node:

1. the packaged landing page is byte-identical to `web/landing/index.html`;
2. every colour token declared in `web/src/tokens.css` appears in the built
   stylesheet, and every asset the packaged index.html references exists.

If either fails, run `pnpm build` in `web/` and commit the result.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
PKG = ROOT / "src" / "toondeck" / "deck" / "api" / "webui"

TOKEN_RE = re.compile(r"(--color-deck-[a-z0-9]+):\s*([^;]+);")


def test_packaged_landing_matches_source():
    src = (WEB / "landing" / "index.html").read_text(encoding="utf-8")
    built = (PKG / "landing" / "index.html").read_text(encoding="utf-8")
    assert src == built, "packaged landing page is stale — run `pnpm build` in web/ and commit"


def test_built_css_carries_the_current_palette():
    tokens = dict(TOKEN_RE.findall((WEB / "src" / "tokens.css").read_text(encoding="utf-8")))
    assert tokens, "tokens.css declares no --color-deck-* tokens"
    css_files = list((PKG / "assets").glob("index-*.css"))
    assert css_files, "no built stylesheet in the package — run `pnpm build` in web/"
    css = " ".join(p.read_text(encoding="utf-8") for p in css_files).lower()
    missing = [f"{name}={value}" for name, value in tokens.items() if value.strip().lower() not in css]
    assert not missing, f"built CSS is stale, missing tokens: {missing}"


def test_packaged_index_references_only_existing_assets():
    html = (PKG / "index.html").read_text(encoding="utf-8")
    refs = re.findall(r'(?:src|href)="([^"]+)"', html)
    local = [r for r in refs if not r.startswith(("http://", "https://", "data:"))]
    missing = [r for r in local if not (PKG / r.lstrip("/")).is_file()]
    assert not missing, f"packaged index.html references missing assets: {missing}"
