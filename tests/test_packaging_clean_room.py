"""Clean-room packaging contract (2026-09-05 audit).

A fresh `pip install toondeck` in a new venv, run against a fake empty HOME,
came back broken in four independent ways that every local test missed, because
the dev box has the engine editable-installed and web/dist built in place:

  1. ModuleNotFoundError: No module named 'mcptoon'  (engine never declared)
  2. httpx missing → live model refresh / chat test crash
  3. the installed wheel contained ZERO .json files — no agent adapters, no
     signature database, no vault provider catalog
  4. no SPA at all: web/dist is gitignored and outside the package, so every
     route answered 404

These tests are the cheap, fast tripwires for that class of bug. The full
venv-install proof lives in .scratch/toondeck-ux/cleanroom.ps1 and belongs on
the release checklist.
"""

from __future__ import annotations

from pathlib import Path

import pytest

try:  # 3.11+ stdlib; the project supports 3.10, where tomli covers it
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    try:
        import tomli as tomllib  # type: ignore[no-redef]
    except ModuleNotFoundError:  # pragma: no cover
        tomllib = None  # type: ignore[assignment]

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "src" / "toondeck"

pytestmark = pytest.mark.skipif(tomllib is None, reason="needs tomllib/tomli")
PYPROJECT = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))


def _runtime_deps() -> list[str]:
    return PYPROJECT["project"]["dependencies"]


def test_engine_is_a_declared_runtime_dependency():
    """The deck is a bridge over mcptoon; deck.engine imports it at module
    level, so an install without it dies before a single route is served."""
    names = [d.split(">=")[0].split("[")[0].strip().lower() for d in _runtime_deps()]
    assert "mcptoon" in names, "mcptoon must be in [project].dependencies"


def test_httpx_is_a_runtime_dependency_not_only_dev():
    """deck.agents imports httpx inside refresh_provider_models/test_provider_chat."""
    names = [d.split(">=")[0].split("[")[0].strip().lower() for d in _runtime_deps()]
    assert "httpx" in names, "httpx is used by production code, not just tests"
    dev = [d.split(">=")[0].strip().lower() for d in PYPROJECT["project"]["optional-dependencies"]["dev"]]
    assert "httpx" not in dev, "declared twice; keep it in the runtime list only"


def test_python_requires_floor_matches_syntax():
    """`str | None` in module annotations needs 3.10+."""
    assert PYPROJECT["project"]["requires-python"] in (">=3.10", ">=3.11")


@pytest.mark.parametrize(
    "package,pattern",
    [
        ("toondeck.deck.agents", "adapters/*.json"),
        ("toondeck.deck.agentdiscover.internal", "signature.json"),
        ("toondeck.deck.vault.internal", "providers.json"),
        ("toondeck.deck.api", "webui/**/*"),
    ],
)
def test_data_files_are_declared_as_package_data(package: str, pattern: str):
    """setuptools ships only *.py unless package-data says otherwise."""
    data = PYPROJECT["tool"]["setuptools"]["package-data"]
    assert pattern in data.get(package, []), f"{package} must declare {pattern}"


def test_agent_adapters_exist_on_disk():
    """The 8 first-class adapters are the whole point of the detect funnel."""
    adapters = list((SRC / "deck" / "agents" / "adapters").glob("*.json"))
    assert len(adapters) >= 8, f"expected the shipped adapters, found {[a.name for a in adapters]}"
    ids = {a.stem for a in adapters}
    assert {"claude-code", "codex", "gemini-cli", "opencode", "omp"} <= ids


def test_signature_and_provider_catalogs_exist_on_disk():
    assert (SRC / "deck" / "agentdiscover" / "internal" / "signature.json").is_file()
    assert (SRC / "deck" / "vault" / "internal" / "providers.json").is_file()


def test_spa_is_shipped_inside_the_package():
    """The build output must live under src/ so the wheel carries the UI.
    A deck that installs to a 404 page is not a deck."""
    index = SRC / "deck" / "api" / "webui" / "index.html"
    assert index.is_file(), "run `pnpm build` in web/ — the SPA builds into the package"
    assert '<div id="root">' in index.read_text(encoding="utf-8")
    assert (SRC / "deck" / "api" / "webui" / "landing" / "index.html").is_file()


def test_static_resolution_survives_an_installed_layout(tmp_path, monkeypatch):
    """_dist_root used to be repo-relative only — meaningless inside a wheel.
    With no repo layout present it must still find the packaged build."""
    from toondeck.deck.api import static as static_mod

    monkeypatch.delenv("TOONDECK_WEB_DIST", raising=False)
    root = static_mod._dist_root()
    assert (root / "index.html").is_file(), f"no UI resolvable from {root}"
    # and the packaged copy is the one an installed deck would use
    assert static_mod._package_webui().name == "webui"


def test_landing_page_resolves_without_repo_web_dir(tmp_path, monkeypatch):
    """Same class of bug for /landing."""
    from toondeck.deck.api import static as static_mod

    monkeypatch.delenv("TOONDECK_WEB_DIST", raising=False)
    assert static_mod.landing_page() is not None


def test_manifest_in_covers_the_same_ground():
    """An sdist install (PyPI's fallback when no wheel matches) must not be
    any worse than the wheel."""
    manifest = (REPO / "MANIFEST.in").read_text(encoding="utf-8")
    for needle in ("adapters *.json", "signature.json", "providers.json", "webui"):
        assert needle in manifest, f"MANIFEST.in missing {needle}"
