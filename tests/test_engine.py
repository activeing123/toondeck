"""T-010/T-011 RED→GREEN: deck.engine bridge contract over the mcptoon library.

Fixture servers include secrets to prove the redaction guarantee:
engine state must NEVER leak env/header values — keys only.
"""

import json


def test_get_state_lists_servers_and_hides_secrets(engine_env):
    from toondeck.deck import engine

    state = engine.get_state()
    names = {s["name"] for s in state["servers"]}
    assert names == {"fetch", "github", "exa"}
    by = {s["name"]: s for s in state["servers"]}
    assert by["fetch"]["transport"] == "stdio"
    assert by["fetch"]["target"] == "npx -y mcp-fetch"
    assert by["github"]["transport"] == "http"
    assert by["github"]["target"] == "http://127.0.0.1:3001/mcp"
    # redaction guarantee: key names visible, values never
    assert by["exa"]["env_keys"] == ["EXA_API_KEY"]
    assert by["github"]["header_keys"] == ["Authorization"]
    blob = json.dumps(state)
    assert "SUPERSECRET" not in blob
    assert "TESTSECRET" not in blob
    assert state["config_path"].endswith("config.json")


def test_get_state_reports_disabled_tools_per_server(engine_env):
    from toondeck.deck import engine
    import mcptoon.config as mcfg

    mcfg.toggle_tool("exa", "websearch")
    state = engine.get_state()
    by = {s["name"]: s for s in state["servers"]}
    assert by["exa"]["disabled_tools"] == ["websearch"]
    assert by["fetch"]["disabled_tools"] == []
    assert state["disabled_total"] == 1


def test_toggle_flips_and_persists_via_engine(engine_env):
    from toondeck.deck import engine

    assert engine.toggle("exa", "websearch") is False
    assert engine.toggle("exa", "websearch") is True
    import mcptoon.config as mcfg

    assert mcfg.is_tool_enabled("exa", "websearch") is True


def test_request_sync_reports_per_agent_results(engine_env, monkeypatch):
    from toondeck.deck import engine
    from toondeck.deck.engine import _internal

    fake = [
        {"agent": "claude-code", "ok": True, "written": True},
        {"agent": "cursor", "ok": False, "error": "boom"},
    ]
    monkeypatch.setattr(_internal, "sync_to_all", lambda **kw: fake)
    assert engine.request_sync() == fake
