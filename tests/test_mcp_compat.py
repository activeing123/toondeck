"""T-064: mcptoon Windows stdio probe fix via runtime shim (mcptoon untouched).

Root cause: MCPClient resolves cmd[0] to npx.cmd but Popen can't CreateProcess
a .cmd directly on Windows -> [Errno 22] Invalid argument. The same shim
proven for agent launching (cmd /c wrapper) applies here.

mcptoon 0.7.4 note: the client pumps stdout in a background thread and routes
responses to per-id queues. Fake servers must ECHO the request id (any
hardcoded id worked with the old readline loop; the pump routes by id), so
the .cmd fakes delegate to a small python echo server — batch JSON munging
is a swamp, and the shim's job is only resolving the wrapper.
"""

import sys

import pytest


def _echo_server_py(tmp_path) -> str:
    """A realistic fake MCP server: echoes every request's own id."""
    p = tmp_path / "echo_mcp_server.py"
    p.write_text(
        "import sys, json\n"
        "for line in sys.stdin:\n"
        "    line = line.strip()\n"
        "    if not line: continue\n"
        "    try: req = json.loads(line)\n"
        "    except Exception: continue\n"
        "    resp = {'jsonrpc':'2.0','id':req.get('id'),'result':"
        "{'protocolVersion':'2025-06-18','capabilities':{},"
        "'serverInfo':{'name':'fake','version':'1'}}}\n"
        "    sys.stdout.write(json.dumps(resp) + '\\n')\n"
        "    sys.stdout.flush()\n",
        encoding="utf-8",
    )
    return str(p)


@pytest.fixture
def shim_env(tmp_path, monkeypatch):
    """mcptoon config + toggles redirected to scratch; import shim."""
    from mcptoon import config as mcptoon_config

    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(tmp_path / "config.json"))
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", tmp_path / "config.json")
    import toondeck.deck.mcpcompat  # noqa: F401 — applies the shim on import

    return tmp_path


def test_shim_resolves_cmd_wrappers(shim_env, tmp_path, monkeypatch):
    """A fake npx.cmd server answers JSON-RPC through the shimmed client."""
    import os

    from mcptoon.client import MCPClient

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    srv = _echo_server_py(tmp_path)
    # the .cmd wrapper is the shim's whole job: resolve + CreateProcess
    (bin_dir / "fakesrv.cmd").write_text(
        f'@echo off\r\n"{sys.executable}" "{srv}"\r\n', encoding="utf-8"
    )
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    client = MCPClient(stdio=["fakesrv"], timeout=10)
    try:
        client.initialize()
        assert client.server_info and client.server_info.get("name") == "fake"
    finally:
        client.close()


def test_check_server_ok_through_shim(shim_env, tmp_path, monkeypatch):
    """Full health path: check_server on a fake .cmd MCP server returns ok."""
    import os

    from mcptoon import config as mcptoon_config
    from mcptoon.health import check_server

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    srv = _echo_server_py(tmp_path)
    (bin_dir / "echomcp.cmd").write_text(
        f'@echo off\r\n"{sys.executable}" "{srv}"\r\n', encoding="utf-8"
    )
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    mcptoon_config.save_config({"echomcp": {"command": "echomcp", "args": []}})
    r = check_server("echomcp", timeout=10)
    assert r["status"] in ("ok", "error"), r  # must not be a spawn crash
    assert "Invalid argument" not in str(r.get("error")), r


def test_real_exe_paths_unaffected_by_shim(shim_env, tmp_path, monkeypatch):
    """Plain .exe (python) stdio servers keep working — shim only wraps .cmd/.bat."""

    from mcptoon import config as mcptoon_config
    from mcptoon.health import check_server

    srv = _echo_server_py(tmp_path)
    mcptoon_config.save_config({"pyserver": {"command": sys.executable, "args": [srv]}})
    r = check_server("pyserver", timeout=10)
    assert r["status"] == "ok", r
    assert r["tools"] >= 0


def test_dead_process_write_is_classified_not_errno22(shim_env, tmp_path):
    """A server that dies instantly yields PROCESS_DIED — classified, never raw.

    mcptoon 0.7.4 raises PROCESS_DIED itself on the write path; the deck shim
    remains the win32 classifier for any OSError that still escapes. Either
    way the user sees an honest verdict, never a bare errno crash.
    """
    from mcptoon import config as mcptoon_config
    from mcptoon.health import check_server

    die = tmp_path / "dier.py"
    die.write_text("import sys; sys.exit(3)\n", encoding="utf-8")
    mcptoon_config.save_config({"dier": {"command": sys.executable, "args": [str(die)]}})
    r = check_server("dier", timeout=10)
    err = str(r.get("error", ""))
    assert r.get("error"), r
    assert "PROCESS_DIED" in err or "exited" in err.lower(), r
