"""T-067: source attribution + model profiles (custom API/model sources)."""

import json

import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    return tmp_path


def test_attributions_maps_configured_names_to_sources(home):
    from toondeck.deck.mcpdiscover import attributions

    agent = home / ".cursor"
    agent.mkdir()
    (agent / "mcp.json").write_text(
        json.dumps({"mcpServers": {"weather": {"command": "wx"}}}), encoding="utf-8"
    )
    out = attributions(home=home)
    assert out.get("weather") == ["cursor"]


def test_engine_state_carries_sources(home, monkeypatch):
    """get_state() decorates each server with its agent-config sources."""
    from toondeck.deck import engine

    # redirect mcptoon config so the test never touches the user's real one
    cfg_file = home / "mcptoon-config.json"
    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(cfg_file))
    import mcptoon.config as mcfg

    monkeypatch.setattr(mcfg, "CONFIG_FILE", cfg_file)
    monkeypatch.setattr(
        "toondeck.deck.mcpdiscover.attributions",
        lambda home=None: {"echo": ["cursor"]},
    )
    mcfg.save_config({"echo": {"command": "x", "args": []}, "solo": {"command": "y"}})
    st = engine.get_state()
    by = {s["name"]: s for s in st["servers"]}
    assert by["echo"]["sources"] == ["cursor"]
    assert by["solo"]["sources"] == ["toondeck"]


def test_profile_crud_and_launch_env(home):
    from toondeck.deck import agents

    r = agents.add_profile("my-proxy", base_url="https://gw.example/v1", api_key="sk-test-123")
    assert r["ok"] is True
    profiles = agents.list_profiles()
    assert profiles["my-proxy"]["base_url"] == "https://gw.example/v1"
    assert "api_key" not in profiles["my-proxy"]  # secret never in JSON

    env = agents.profile_launch_env("my-proxy")
    assert env["OPENAI_BASE_URL"] == "https://gw.example/v1"
    assert env["ANTHROPIC_API_KEY"] == "sk-test-123"

    assert agents.remove_profile("my-proxy")["ok"] is True
    assert "my-proxy" not in agents.list_profiles()


def test_launch_with_profile_injects_env(home, monkeypatch):
    """launch(profile=...) merges profile env into the spawned process."""
    from toondeck.deck.agents.internal import manager as manager_mod

    agents_add = __import__("toondeck.deck.agents", fromlist=["agents"])
    agents_add.add_profile("px", base_url="https://x/v1", api_key="sk-k")

    captured = {}

    class FakeProc:
        pid = 7
        stdout = None
        stderr = None

        def poll(self):
            return 0

    def fake_popen(cmd, **kw):
        captured["env"] = kw.get("env")
        return FakeProc()

    monkeypatch.setattr(manager_mod.subprocess, "Popen", fake_popen)
    adapter = {
        "id": "pp",
        "display_name": "PP",
        "launch_command": ["python", "-c", "1"],
        "executable_probes": [],
    }
    from toondeck.deck.agents.internal.manager import Manager

    m = Manager()
    r = m.launch("pp", adapter, profile_env=agents_add.profile_launch_env("px"))
    assert r["ok"] is True
    assert captured["env"]["OPENAI_BASE_URL"] == "https://x/v1"


def test_api_profiles_routes(home):
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    r = c.post("/api/agents/profiles", json={"name": "gw", "base_url": "https://g/v1"})
    assert r.json()["ok"] is True
    assert "gw" in c.get("/api/agents/profiles").json()["profiles"]
    assert c.delete("/api/agents/profiles/gw").json()["ok"] is True
