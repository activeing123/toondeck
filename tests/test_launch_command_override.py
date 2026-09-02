"""UX-B5 RED→GREEN: GUI-only agents (catpaw) get a user-supplied launch command.

override_launch_command() writes a FULL override adapter into
TOONDECK_HOME/adapters.d/{id}.json — the registry merges user adapters last,
so the builtin file stays untouched and /api/agents picks the command up on
the next read. The API route splits a raw command string for the UI form.
"""

import json

from fastapi.testclient import TestClient


def test_override_launch_command_writes_adapter_override(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    from toondeck.deck.agentdiscover import override_launch_command
    from toondeck.deck.agents import internal as agents_internal

    r = override_launch_command("catpaw", ["catpaw", "--workspace", "demo"])
    assert r["ok"] is True
    f = tmp_path / "adapters.d" / "catpaw.json"
    assert f.is_file()
    data = json.loads(f.read_text(encoding="utf-8"))
    assert data["launch_command"] == ["catpaw", "--workspace", "demo"]
    merged = agents_internal.load_all()
    assert merged["catpaw"]["launch_command"] == ["catpaw", "--workspace", "demo"]
    # the builtin file must stay untouched — override lives in adapters.d only
    builtin = json.loads(
        (agents_internal.ADAPTERS_DIR / "catpaw.json").read_text(encoding="utf-8")
    )
    assert builtin.get("launch_command") is None


def test_override_launch_command_rejects_unknown_and_bad_input(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    from toondeck.deck.agentdiscover import override_launch_command

    assert override_launch_command("nosuchagent", ["x"])["ok"] is False
    assert override_launch_command("catpaw", [])["ok"] is False
    assert override_launch_command("catpaw", ["ok", ""])["ok"] is False
    assert override_launch_command("BAD ID!", ["x"])["ok"] is False


def test_api_launch_command_roundtrip_activates_launch(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    before = {a["id"]: a for a in c.get("/api/agents").json()["agents"]}
    assert before["catpaw"]["launch_command"] is None

    r = c.post(
        "/api/agents/catpaw/launch-command",
        json={"command": "catpaw --workspace demo"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True

    after = {a["id"]: a for a in c.get("/api/agents").json()["agents"]}
    assert after["catpaw"]["launch_command"] == ["catpaw", "--workspace", "demo"]

    bad = c.post(
        "/api/agents/nosuchagent/launch-command", json={"command": "x"}
    )
    assert bad.status_code == 404
