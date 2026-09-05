"""P0-1 RED: the skills source must be configurable, not hard-wired to
~/.toondeck/skills. Real machines have a pre-existing skills farm
(E:\\shared\\skills linked into three agents). ToonDeck must be able to
adopt that directory as its source WITHOUT touching it (coexistence law:
new system must not break old habits), via ~/.toondeck/config.json:

    {"skills_source": "E:\\shared\\skills"}

Precedence: explicit env TOONDECK_SKILLS_DIR (tests/sandbox) > config.json
> default ~/.toondeck/skills. When the configured source is outside
~/.toondeck, the hub's own state dirs (graveyard/archive/watcher pid) must
still live INSIDE ~/.toondeck (the hub's home is the hub's, the source is
the world's).
"""

from __future__ import annotations

import json

import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    hub_home = tmp_path / "hub"
    hub_home.mkdir()
    monkeypatch.setenv("TOONDECK_HOME", str(hub_home))
    # neutralize any machine-level env override so the precedence chain is what we test
    monkeypatch.delenv("TOONDECK_SKILLS_DIR", raising=False)
    return hub_home


def test_default_source_is_home_toondeck_skills(home, monkeypatch):
    import pathlib

    monkeypatch.setattr(pathlib.Path, "home", lambda: home, raising=False)
    from toondeck.deck.skills.internal import source_dir

    assert source_dir() == home / "skills"


def test_config_file_adopts_external_source(home):
    cfg = home / "config.json"
    cfg.write_text(json.dumps({"skills_source": "E:/shared/skills"}), encoding="utf-8")
    from toondeck.deck.skills.internal import source_dir, source_root

    assert source_dir() == __import__("pathlib").Path("E:/shared/skills")
    # hub state stays in the hub home even when the source lives elsewhere
    assert source_root() == home


def test_source_root_default_stays_under_home(home):
    from toondeck.deck.skills.internal import source_root

    assert source_root() == home


def test_env_override_still_wins_over_config(home):
    (home / "config.json").write_text(
        json.dumps({"skills_source": "E:/shared/skills"}), encoding="utf-8"
    )
    external = home.parent / "env-skills"
    external.mkdir()
    import os

    os.environ["TOONDECK_SKILLS_DIR"] = str(external)
    try:
        from toondeck.deck.skills.internal import source_dir

        assert source_dir() == external
    finally:
        del os.environ["TOONDECK_SKILLS_DIR"]


def test_invalid_config_source_type_is_ignored(home):
    (home / "config.json").write_text(json.dumps({"skills_source": 12345}), encoding="utf-8")
    from toondeck.deck.skills.internal import source_dir

    # garbage must not crash the hub: fall back to the default derivation
    assert source_dir().name == "skills"


def test_config_get_state_reports_adopted_source(home):
    (home / "config.json").write_text(
        json.dumps({"skills_source": "E:/shared/skills"}), encoding="utf-8"
    )
    from toondeck.deck.skills import get_state

    state = get_state()
    assert state["source"] == str(__import__("pathlib").Path("E:/shared/skills"))
