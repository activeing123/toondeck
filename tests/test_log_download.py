"""T-068: downloadable agent-ready log report."""

import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    return tmp_path


def test_log_download_reports_never_launched(home):
    from toondeck.deck import agents

    r = agents.log_download("codex")
    assert r["lines"] == 0
    assert "state: never" in r["content"]
    assert "ToonDeck agent log report" in r["content"]
    assert "root cause" in r["content"].lower()


def test_log_download_includes_real_logs_and_context(home, monkeypatch):
    """A real launch (fake exe via .cmd shim) feeds the ring; report carries it."""
    import os

    from toondeck.deck import agents
    from toondeck.deck.agents.internal import manager as manager_mod

    bin_dir = home / "bin"
    bin_dir.mkdir()
    shim = bin_dir / "logwriter.cmd"
    shim.write_text(
        "@echo off\r\necho FATAL: stdin is not a terminal\r\nexit /b 1\r\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    adapter = {
        "id": "logwriter",
        "display_name": "Log Writer",
        "launch_command": ["logwriter"],
        "executable_probes": [],
        "tui": False,
    }
    captured = {}

    real_popen = manager_mod.subprocess.Popen

    def popen(cmd, **kw):
        captured["cmd"] = cmd
        return real_popen(["cmd", "/c", str(shim)], **{k: v for k, v in kw.items() if k == "stdout" or k == "stderr" or k == "text" or k == "encoding" or k == "errors" or k == "creationflags" or k == "env" or k == "cwd"})

    monkeypatch.setattr(manager_mod.subprocess, "Popen", popen)
    m = manager_mod.get_manager()
    m.procs.clear()
    r = m.launch("logwriter", adapter)
    assert r["ok"] is True and r["mode"] == "pipe"
    proc = m.procs["logwriter"]
    proc.process.wait(timeout=10)
    proc.reap()

    agents.set_model("logwriter", "glm-5.3")
    rep = agents.log_download("logwriter")
    assert "FATAL: stdin is not a terminal" in rep["content"]
    assert "state: exited" in rep["content"]
    assert "model: glm-5.3" in rep["content"]
    assert "exit_code: 1" in rep["content"]
    # redaction gate must hold in downloads too
    assert "sk-" not in rep["content"].replace("sk-test", "")
    assert "```" in rep["content"]


def test_api_download_route_headers(home):
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    r = c.get("/api/agents/codex/logs/download")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    assert "toondeck-codex-log.md" in r.headers["content-disposition"]
    assert r.text.startswith("# ToonDeck agent log report")
    body = json.loads("{}") if False else None  # noqa: F841 — markdown body, not JSON
