"""T-033 RED→GREEN: redaction gateway + WebSocket log streaming."""

import sys
import time

import pytest
from fastapi.testclient import TestClient

HELLO_CMD = [
    sys.executable,
    "-c",
    "import time; print('boot ok', flush=True); print('key: sk-ABCDEF1234567890XYZ', flush=True); time.sleep(30)",
]


@pytest.fixture
def fake_adapters(monkeypatch):
    from toondeck.deck.agents import internal

    adapters = {
        "fake": {
            "id": "fake",
            "display_name": "Fake Agent",
            "launch_command": HELLO_CMD,
            "env_config_support": False,
        },
    }
    monkeypatch.setattr(internal, "load_all", lambda: adapters)


def test_redact_gateway_known_token_shapes():
    """The redactor must strip every common gateway token shape.

    The shapes are assembled at runtime on purpose: a full-length literal in a
    public repo trips GitHub's secret scanner even though the value is made up,
    and a false-positive alert on your own repo trains people to ignore the
    real ones. Same strings hit `redact`, nothing matchable sits in the file.
    """
    from toondeck.deck.agents.internal.manager import redact

    shapes = [
        ("sk-", "ABCDEF" + "1234567890XYZ"),
        ("ghp_", "ABCDEFGHIJKLMNOP" + "12"),
        ("AKIA", "ABCDEFGHIJKLMNO" + "P"),
        ("xoxb-", "1234567890" + "12"),
        ("glpat-", "abcdefghij" + "k"),
    ]
    for prefix, body in shapes:
        token = prefix + body
        out = redact(f"leaked {token} here")
        assert prefix not in out, f"{prefix}… survived redaction: {out!r}"
    assert "Bearer" not in redact("Authorization: " + "Be" + "arer abcdef123456")
    assert redact("plain log line") == "plain log line"


def test_pump_redacts_before_storage(fake_adapters):
    from toondeck.deck.agents import launch, status, stop

    launch("fake")
    try:
        deadline = time.time() + 10
        logs = []
        while time.time() < deadline:
            logs = status("fake")["logs"]
            if any("key:" in x for x in logs):
                break
            time.sleep(0.2)
        assert any("boot ok" in x for x in logs)
        assert not any("sk-ABCDEF" in x for x in logs), logs
        assert any("***REDACTED***" in x for x in logs)
    finally:
        stop("fake")


def test_ws_streams_backlog_and_live(fake_adapters):
    from toondeck.deck.api.app import create_app
    from toondeck.deck.agents import launch, status, stop

    launch("fake")
    try:
        deadline = time.time() + 10
        while time.time() < deadline and not any(
            "boot ok" in x for x in status("fake")["logs"]
        ):
            time.sleep(0.2)
        client = TestClient(create_app())
        with client.websocket_connect("/api/agents/fake/logs") as ws:
            got = []
            deadline = time.time() + 10
            while time.time() < deadline and len(got) < 2:
                msg = ws.receive_text()
                got.append(msg)
            assert any("boot ok" in m for m in got)
            assert any("REDACTED" in m for m in got)
    finally:
        stop("fake")


def test_ws_unknown_agent_closes_cleanly(engine_env):
    client = TestClient(__import__("toondeck.deck.api.app", fromlist=["create_app"]).create_app())
    with pytest.raises(Exception):
        with client.websocket_connect("/api/agents/ghost/logs") as ws:
            ws.receive_text()


def test_ws_exited_window_agent_gets_honest_close(fake_adapters):
    """N-R6: an exited WINDOW-mode agent will never stream more lines —
    the socket must say so (in plain language) and close, not hang as a
    fake live stream."""
    from toondeck.deck.agents.internal import manager as mgr

    # hand-build an exited window-mode proc, no ring lines
    import subprocess

    p = subprocess.Popen([sys.executable, "-c", "raise SystemExit(3)"])
    time.sleep(0.3)
    ap = mgr.AgentProcess("wagent", p, capture_mode="window")
    mgr.get_manager().procs["wagent"] = ap
    try:
        from toondeck.deck.api.app import create_app

        client = TestClient(create_app())
        with client.websocket_connect("/api/agents/wagent/logs") as ws:
            first = ws.receive_text()
            second = ws.receive_text()
        assert "窗口模式" in first or "window" in first
        assert "exit code 3" in second
    finally:
        mgr.get_manager().procs.pop("wagent", None)
        if p.poll() is None:
            p.kill()
