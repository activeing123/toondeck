"""T-066: TUI agents launch in a new console window (stdin is a real terminal)."""

import subprocess

import pytest


@pytest.fixture
def redirect_home(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    return tmp_path


def test_tui_adapter_defaults_to_window_mode(redirect_home, monkeypatch):
    from toondeck.deck.agents.internal import manager as manager_mod

    adapter = {
        "id": "fakeui",
        "display_name": "Fake UI",
        "launch_command": ["python", "-c", "print('hi')"],
        "executable_probes": [],
        "tui": True,
    }
    captured = {}

    class FakeProc:
        pid = 4242
        stdout = None
        stderr = None

        def poll(self):
            return 0

    def fake_popen(cmd, **kw):
        captured["cmd"] = cmd
        captured["flags"] = kw.get("creationflags", 0)
        return FakeProc()

    monkeypatch.setattr(manager_mod.subprocess, "Popen", fake_popen)
    from toondeck.deck.agents.internal.manager import Manager

    m = Manager()
    r = m.launch("fakeui", adapter)
    assert r["ok"] is True
    assert r["mode"] == "window"
    assert captured["flags"] & subprocess.CREATE_NEW_CONSOLE


def test_pipe_mode_still_default_for_non_tui(redirect_home, monkeypatch):
    from toondeck.deck.agents.internal import manager as manager_mod

    adapter = {
        "id": "plain",
        "display_name": "Plain",
        "launch_command": ["python", "-c", "print('hi')"],
        "executable_probes": [],
    }
    captured = {}

    class FakeProc:
        pid = 1
        stdout = None
        stderr = None

        def poll(self):
            return 0

    def fake_popen(cmd, **kw):
        captured["flags"] = kw.get("creationflags", 0)
        return FakeProc()

    monkeypatch.setattr(manager_mod.subprocess, "Popen", fake_popen)
    from toondeck.deck.agents.internal.manager import Manager

    m = Manager()
    r = m.launch("plain", adapter)
    assert r["ok"] is True
    assert r["mode"] == "pipe"
    assert captured["flags"] & subprocess.CREATE_NEW_CONSOLE == 0


def test_explicit_override_wins_over_tui_default(redirect_home, monkeypatch):
    from toondeck.deck.agents.internal import manager as manager_mod

    adapter = {
        "id": "fakeui2",
        "display_name": "Fake UI 2",
        "launch_command": ["python", "-c", "print('hi')"],
        "executable_probes": [],
        "tui": True,
    }

    class FakeProc:
        pid = 1
        stdout = None
        stderr = None

        def poll(self):
            return 0

    monkeypatch.setattr(
        manager_mod.subprocess, "Popen", lambda cmd, **kw: FakeProc()
    )
    from toondeck.deck.agents.internal.manager import Manager

    m = Manager()
    r = m.launch("fakeui2", adapter, window=False)
    assert r["mode"] == "pipe"


def test_api_launch_reports_mode(redirect_home, monkeypatch):
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    r = c.post("/api/agents/catpaw/launch", json={})
    assert r.status_code == 200
    body = r.json()
    # catpaw adapter is GUI-only (no launch command) — must say so honestly
    assert body["ok"] is False
    assert "no launch command" in body["error"]


def test_real_window_smoke(tmp_path):
    """A real CREATE_NEW_CONSOLE spawn runs and exits (writes marker file)."""
    import sys

    marker = tmp_path / "marker.txt"
    code = f"import pathlib; pathlib.Path(r'{marker}').write_text('ok')"
    p = subprocess.Popen(
        [sys.executable, "-c", code],
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )
    p.wait(timeout=30)
    assert marker.read_text() == "ok"
