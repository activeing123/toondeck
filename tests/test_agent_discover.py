"""T-065 RED: universal agent discovery (signature DB + mcpServers fingerprint + adoption)."""

import json



def test_signature_db_has_at_least_twenty_agents():
    from toondeck.deck.agentdiscover import signature_db

    db = signature_db()
    assert len(db) >= 20
    entry = db[0]
    assert {"label", "dirs", "exes"} <= set(entry)


def test_fingerprint_finds_mcp_config_of_unknown_agent(tmp_path):
    """An agent we never heard of, configured for MCP, must be discoverable."""
    unknown = tmp_path / ".myagent"
    unknown.mkdir()
    (unknown / "mcp.json").write_text(
        json.dumps({"mcpServers": {"x": {"command": "x"}}}), encoding="utf-8"
    )
    from toondeck.deck.agentdiscover import fingerprint

    hits = fingerprint(home=tmp_path)
    assert any(".myagent" in str(h["path"]) for h in hits)


def test_fingerprint_ignores_dirs_without_mcp_markers(tmp_path):
    d = tmp_path / ".plain"
    d.mkdir()
    (d / "stuff.json").write_text(json.dumps({"hello": 1}), encoding="utf-8")
    from toondeck.deck.agentdiscover import fingerprint

    assert not [h for h in fingerprint(home=tmp_path) if ".plain" in str(h["path"])]


def test_unknown_agents_lists_unrecognized_mcp_dirs(tmp_path):
    unknown = tmp_path / ".strangecli"
    unknown.mkdir()
    (unknown / "mcp.json").write_text(
        json.dumps({"mcpServers": {"y": {"url": "http://x"}}}), encoding="utf-8"
    )
    # a KNOWN agent must not be reported as unknown
    known = tmp_path / ".cursor"
    known.mkdir()
    (known / "mcp.json").write_text(
        json.dumps({"mcpServers": {"z": {"command": "z"}}}), encoding="utf-8"
    )
    from toondeck.deck.agentdiscover import unknown_agents

    names = [u["label"] for u in unknown_agents(home=tmp_path)]
    assert "strangecli" in names
    assert "cursor" not in names


def test_adopt_writes_user_adapter_and_load_all_sees_it(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    from toondeck.deck.agentdiscover import adopt
    from toondeck.deck.agents import internal as agents_internal

    r = adopt("strangecli", launch_command=["strangecli", "--mcp"])
    assert r["ok"] is True
    f = tmp_path / "adapters.d" / "strangecli.json"
    assert f.is_file()
    merged = agents_internal.load_all()
    assert merged["strangecli"]["display_name"] == "Strangecli"


def test_api_discover_adopt_roundtrip(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    from toondeck.deck.api.app import create_app
    from toondeck.deck import agentdiscover

    unknown = tmp_path / ".mysteryai"
    unknown.mkdir()
    (unknown / "mcp.json").write_text(
        json.dumps({"mcpServers": {"q": {"command": "q"}}}), encoding="utf-8"
    )
    real_fingerprint = agentdiscover.fingerprint
    monkeypatch.setattr(agentdiscover, "fingerprint", lambda *a, **k: real_fingerprint(home=tmp_path))
    real_unknown = agentdiscover.unknown_agents
    monkeypatch.setattr(agentdiscover, "unknown_agents", lambda *a, **k: real_unknown(home=tmp_path))

    c = TestClient(create_app())
    d = c.get("/api/agents/discover").json()
    assert any(u["label"] == "mysteryai" for u in d["unknown"])
    r = c.post("/api/agents/adopt", json={"label": "mysteryai", "launch_command": ["mysteryai"]}).json()
    assert r["ok"] is True
    ag = c.get("/api/agents").json()
    assert any(a["id"] == "mysteryai" for a in ag["agents"])
