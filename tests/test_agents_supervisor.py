"""T-032 RED→GREEN: launch/stop + process supervisor (handle table, exit codes, reap)."""

import sys
import time

import pytest

FAKE_CMD = [
    sys.executable,
    "-c",
    "import sys, time; print('hello-fake', flush=True); time.sleep(30)",
]
EXIT_CMD = [sys.executable, "-c", "print('bye', flush=True); import sys; sys.exit(7)"]


@pytest.fixture
def fake_adapters(monkeypatch):
    from toondeck.deck.agents import internal

    adapters = {
        "fake": {
            "id": "fake",
            "display_name": "Fake Agent",
            "launch_command": FAKE_CMD,
            "env_config_support": False,
        },
        "quitter": {
            "id": "quitter",
            "display_name": "Quitter",
            "launch_command": EXIT_CMD,
            "env_config_support": False,
        },
        "nolaunch": {
            "id": "nolaunch",
            "display_name": "No Launch",
            "launch_command": None,
            "env_config_support": False,
        },
    }
    monkeypatch.setattr(internal, "load_all", lambda: adapters)
    return adapters


def test_launch_captures_logs_and_stops(fake_adapters):
    from toondeck.deck.agents import launch, status, stop

    r = launch("fake")
    assert r["ok"] is True
    try:
        deadline = time.time() + 10
        logs = []
        while time.time() < deadline:
            logs = status("fake")["logs"]
            if any("hello-fake" in x for x in logs):
                break
            time.sleep(0.2)
        assert any("hello-fake" in x for x in logs), logs
        assert status("fake")["state"] == "running"
    finally:
        s = stop("fake")
    assert s["ok"] is True
    assert s["exit_code"] is not None
    assert status("fake")["state"] == "exited"


def test_launch_twice_rejected_while_running(fake_adapters):
    from toondeck.deck.agents import launch, stop

    assert launch("fake")["ok"] is True
    try:
        r2 = launch("fake")
        assert r2["ok"] is False
        assert "running" in r2["error"].lower()
    finally:
        stop("fake")


def test_launch_unknown_agent_is_clean(fake_adapters):
    from toondeck.deck.agents import launch

    r = launch("ghost")
    assert r["ok"] is False
    assert "unknown" in r["error"].lower()


def test_launch_without_command_is_honest(fake_adapters):
    from toondeck.deck.agents import launch

    r = launch("nolaunch")
    assert r["ok"] is False
    assert "launch" in r["error"].lower()


def test_exit_code_reaped_after_exit(fake_adapters):
    from toondeck.deck.agents import launch, status

    launch("quitter")
    deadline = time.time() + 10
    st = {}
    while time.time() < deadline:
        st = status("quitter")
        if st["state"] == "exited":
            break
        time.sleep(0.2)
    assert st["state"] == "exited"
    assert st["exit_code"] == 7


def test_launch_handles_windows_cmd_wrapper(fake_adapters, tmp_path, monkeypatch):
    """npm-style .CMD wrappers (claude etc.) must spawn via cmd /c, not WinError 2."""
    import os

    from toondeck.deck.agents import internal
    from toondeck.deck.agents import launch, status

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    script = bin_dir / "fakewrap.cmd"
    script.write_text("@echo wrapped-ok\r\n@exit /b 0\r\n", encoding="utf-8")
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    adapters = dict(internal.load_all())
    adapters["wrapped"] = {
        "id": "wrapped",
        "display_name": "Wrapped",
        "launch_command": ["fakewrap"],
        "env_config_support": False,
    }
    monkeypatch.setattr(internal, "load_all", lambda: adapters)

    r = launch("wrapped")
    assert r["ok"] is True, r
    deadline = time.time() + 10
    logs = []
    while time.time() < deadline:
        logs = status("wrapped")["logs"]
        if any("wrapped-ok" in x for x in logs):
            break
        time.sleep(0.2)
    assert any("wrapped-ok" in x for x in logs), logs


def test_launch_extra_args_are_passed_through(fake_adapters):
    from toondeck.deck.agents import launch, status

    r = launch("quitter", args=["--flag"])
    assert r["ok"] is True, r
    deadline = time.time() + 10
    st = {}
    while time.time() < deadline:
        st = status("quitter")
        if st["state"] == "exited":
            break
        time.sleep(0.2)
    assert st["state"] == "exited"
    assert st["exit_code"] == 7  # EXIT_CMD ignores args but must still run
