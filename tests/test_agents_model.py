"""T-061 RED: per-agent model preference — persist + inject (env or arg channel)."""

import json

import pytest


@pytest.fixture
def agents_home(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    return tmp_path


def test_set_model_persists_per_agent(agents_home):
    from toondeck.deck.agents import get_model, set_model

    r = set_model("claude-code", "claude-sonnet-4-5")
    assert r["ok"] is True
    assert get_model("claude-code") == "claude-sonnet-4-5"
    data = json.loads((agents_home / "agents.json").read_text(encoding="utf-8"))
    assert data["models"]["claude-code"] == "claude-sonnet-4-5"


def test_clear_model(agents_home):
    from toondeck.deck.agents import get_model, set_model

    set_model("codex", "gpt-5.2-codex")
    assert get_model("codex") == "gpt-5.2-codex"
    set_model("codex", None)
    assert get_model("codex") is None


def test_models_all_listing(agents_home):
    from toondeck.deck.agents import get_models, set_model

    set_model("claude-code", "m1")
    set_model("codex", "m2")
    assert get_models() == {"claude-code": "m1", "codex": "m2"}


def test_launch_injects_model_via_env_channel(agents_home, tmp_path, monkeypatch):
    """claude-code adapter: model_env=ANTHROPIC_MODEL -> plain env injection."""
    import time

    from toondeck.deck.agents import internal as agents_internal
    from toondeck.deck.agents import launch, set_model, status, stop

    set_model("envy", "my-model-1")
    echo_cmd = [
        __import__("sys").executable,
        "-c",
        "import os, time; print('model=' + os.environ.get('THE_MODEL', 'MISSING'), flush=True); time.sleep(30)",
    ]
    adapters = {
        "envy": {"id": "envy", "display_name": "Envy", "launch_command": echo_cmd,
                 "env_config_support": True, "model_env": "THE_MODEL"},
    }
    monkeypatch.setattr(agents_internal, "load_all", lambda: adapters)

    r = launch("envy")
    assert r["ok"] is True, r
    try:
        deadline = time.time() + 10
        logs = []
        while time.time() < deadline:
            logs = status("envy")["logs"]
            if any("model=" in x for x in logs):
                break
            time.sleep(0.2)
        assert any("model=my-model-1" in x for x in logs), logs
    finally:
        stop("envy")


def test_launch_injects_model_via_arg_channel(agents_home, tmp_path, monkeypatch):
    """CLI-shaped agent (npm shim): model_arg inserted right after command name."""
    import os
    import time

    from toondeck.deck.agents import internal as agents_internal
    from toondeck.deck.agents import launch, set_model, status, stop

    set_model("echoy", "mm2")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "echoy.cmd").write_text("@echo args=%*\r\n@exit /b 0\r\n", encoding="utf-8")
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    adapters = {
        "echoy": {"id": "echoy", "display_name": "Echoy",
                  "launch_command": ["echoy"],
                  "env_config_support": True, "model_arg": "-m"},
    }
    monkeypatch.setattr(agents_internal, "load_all", lambda: adapters)

    r = launch("echoy")
    assert r["ok"] is True, r
    try:
        deadline = time.time() + 10
        logs = []
        while time.time() < deadline:
            logs = status("echoy")["logs"]
            if any("args=" in x for x in logs):
                break
            time.sleep(0.2)
        assert any("args=-m mm2" in x for x in logs), logs
    finally:
        stop("echoy")
