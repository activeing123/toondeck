"""T-002 RED→GREEN: static hosting contract — deck.api.static.resolve must
guarantee SPA serving behavior without ever leaving the dist root."""

import pytest

from toondeck.deck.api import static as static_mod


def test_returns_none_when_dist_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(static_mod, "_dist_root", lambda: tmp_path / "nope")
    assert static_mod.resolve("index.html") is None


def test_serves_index_for_root_path(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>deck</html>", encoding="utf-8")
    monkey = pytest.MonkeyPatch()
    monkey.setattr(static_mod, "_dist_root", lambda: dist)
    try:
        assert static_mod.resolve("/") == dist / "index.html"
        assert static_mod.resolve("index.html") == dist / "index.html"
    finally:
        monkey.undo()


def test_rejects_path_traversal(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>deck</html>", encoding="utf-8")
    monkey = pytest.MonkeyPatch()
    monkey.setattr(static_mod, "_dist_root", lambda: dist)
    try:
        for evil in ("../secret.txt", "..\\secret.txt", "a/../../b"):
            assert static_mod.resolve(evil) is None
    finally:
        monkey.undo()


def test_serves_existing_assets(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>deck</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    monkey = pytest.MonkeyPatch()
    monkey.setattr(static_mod, "_dist_root", lambda: dist)
    try:
        assert static_mod.resolve("/assets/app.js") == dist / "assets" / "app.js"
        assert static_mod.resolve("/missing.js") is None  # asset-like miss → 404
        # SPA fallback: extensionless deep route must serve the shell
        assert static_mod.resolve("/some/deep/route") == dist / "index.html"
    finally:
        monkey.undo()
