"""T-060 RED: MCP auto-discovery (5 source formats) + dedup + mcptoon import."""

import json

import pytest


@pytest.fixture
def fake_home(tmp_path, monkeypatch):
    """A $HOME with four real-world-shaped MCP config files."""
    (tmp_path / ".claude.json").write_text(
        json.dumps({"mcpServers": {
            "weather": {"command": "npx", "args": ["-y", "weather-mcp"]},
            "github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]},
        }}),
        encoding="utf-8",
    )
    cursor = tmp_path / ".cursor"
    cursor.mkdir()
    (cursor / "mcp.json").write_text(
        json.dumps({"mcpServers": {
            "docs": {"url": "https://docs.example.com/mcp"},
            "weather": {"command": "npx", "args": ["-y", "weather-mcp"]},
        }}),
        encoding="utf-8",
    )
    codex = tmp_path / ".codex"
    codex.mkdir()
    (codex / "config.toml").write_text(
        '[mcp_servers.search]\ncommand = "uvx"\nargs = ["mcp-search"]\n',
        encoding="utf-8",
    )
    gemini = tmp_path / ".gemini"
    gemini.mkdir()
    (gemini / "settings.json").write_text(
        json.dumps({"mcpServers": {"paint": {"command": "python", "args": ["paint.py"]}}}),
        encoding="utf-8",
    )
    # windsurf-style path (deeper, non-dotfile layout)
    ws = tmp_path / ".codeium" / "windsurf"
    ws.mkdir(parents=True)
    (ws / "mcp_config.json").write_text(
        json.dumps({"mcpServers": {"kite": {"command": "kite-mcp"}}}),
        encoding="utf-8",
    )
    return tmp_path


def test_scan_finds_all_five_sources_with_attribution(fake_home):
    from toondeck.deck.mcpdiscover import scan

    found = scan(home=fake_home)
    by_name = {c["name"]: c for c in found["candidates"]}
    assert {"weather", "github", "docs", "search", "paint", "kite"} <= set(by_name)
    assert by_name["weather"]["sources"] == ["claude-code", "cursor"]
    assert by_name["search"]["command"] == "uvx"
    assert by_name["search"]["args"] == ["mcp-search"]
    assert by_name["docs"]["transport"] == "http"
    assert by_name["docs"]["url"] == "https://docs.example.com/mcp"
    assert by_name["weather"]["transport"] == "stdio"


def test_scan_dedup_same_name_same_command(fake_home):
    from toondeck.deck.mcpdiscover import scan

    found = scan(home=fake_home)
    weathers = [c for c in found["candidates"] if c["name"] == "weather"]
    assert len(weathers) == 1


def test_scan_tolerates_broken_and_absent_configs(fake_home):
    (fake_home / "broken.json").write_text("{not json", encoding="utf-8")
    from toondeck.deck.mcpdiscover import scan

    found = scan(home=fake_home)  # must not raise
    assert found["candidates"]


def test_import_uses_mcptoon_add_server_and_is_idempotent(fake_home, tmp_path, monkeypatch):
    from mcptoon import config as mcptoon_config

    cfg_file = tmp_path / "mcptoon-config.json"
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", cfg_file)

    from toondeck.deck.mcpdiscover import import_names, scan

    found = scan(home=fake_home)
    r = import_names(found["candidates"], names=["weather", "search"])
    assert r["imported"] == 2
    assert r["skipped"] == 0

    # idempotent second pass
    r2 = import_names(found["candidates"], names=["weather", "search"])
    assert r2["imported"] == 0
    assert r2["skipped"] == 2

    cfg = mcptoon_config.load_config()
    assert cfg["weather"]["command"] == "npx"
    assert cfg["search"]["command"] == "uvx"


def test_api_discover_and_import_routes(fake_home, monkeypatch):
    from fastapi.testclient import TestClient

    from mcptoon import config as mcptoon_config

    cfg_file = tmp_cfg = fake_home / "mcptoon-config.json"
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", cfg_file)

    from toondeck.deck.api.app import create_app
    from toondeck.deck import mcpdiscover

    real_scan = mcpdiscover.scan
    monkeypatch.setattr(mcpdiscover, "scan", lambda: real_scan(home=fake_home))

    c = TestClient(create_app())
    d = c.get("/api/mcp/discover").json()
    assert d["total"] >= 6
    r = c.post("/api/mcp/import", json={"names": ["paint", "kite"]}).json()
    assert r["imported"] == 2
    assert c.get("/api/mcp/discover").json()["total"] >= 6
    del tmp_cfg
