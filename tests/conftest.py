"""Shared fixtures: hermetic mcptoon environment (tmp config + toggles)."""

import json

import pytest

FIXTURE_SERVERS = {
    "fetch": {"transport": "stdio", "command": ["npx", "-y"], "args": ["mcp-fetch"]},
    "github": {
        "transport": "http",
        "url": "http://127.0.0.1:3001/mcp",
        "headers": {"Authorization": "Bearer ghp_SUPERSECRET"},
    },
    "exa": {
        "transport": "stdio",
        "command": ["node", "exa.js"],
        "env": {"EXA_API_KEY": "sk-TESTSECRET"},
    },
}


@pytest.fixture
def engine_env(tmp_path, monkeypatch):
    """Redirect all mcptoon config I/O into tmp_path (env + TOGGLE_FILE + cwd)."""
    cfg_file = tmp_path / "config.json"
    cfg_file.write_text(json.dumps({"servers": FIXTURE_SERVERS}), encoding="utf-8")
    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(cfg_file))
    monkeypatch.setenv("MCPTOON_CONFIG_FILE_TOML", str(tmp_path / "nope.toml"))
    monkeypatch.chdir(tmp_path)
    import mcptoon.config as mcfg

    monkeypatch.setattr(mcfg, "TOGGLE_FILE", tmp_path / "toggles.json")
    # mcptoon 0.8.22 split the schema cache from one shared `schema_cache.json`
    # into one file per server under a cache directory, and dropped the private
    # `_CACHE_FILE` symbol this fixture used to patch. Redirect the documented
    # env var instead: it is resolved at call time inside mcptoon.cache, so no
    # private name is touched and a future layout change cannot break the suite.
    monkeypatch.setenv("MCPTOON_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("TOONDECK_SKILLS_DIR", str(tmp_path / "skills"))
    monkeypatch.setenv("TOONDECK_VIEWS_DIR", str(tmp_path / "views"))
    # R45: the activity journal must be hermetic too — API tests record deck
    # actions, and without this they would append to the REAL ~/.toondeck
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path / "toondeck-home"))
    return tmp_path
