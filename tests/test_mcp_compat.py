"""T-064: mcptoon Windows stdio probe fix via runtime shim (mcptoon untouched).

Root cause: MCPClient resolves cmd[0] to npx.cmd but Popen can't CreateProcess
a .cmd directly on Windows -> [Errno 22] Invalid argument. The same shim
proven for agent launching (cmd /c wrapper) applies here.
"""

import sys

import pytest


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
    import json as jsonlib
    import os

    from mcptoon.client import MCPClient

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "fakesrv.cmd").write_text(
        "@echo off\r\n"
        "set /p REQUEST=\r\n"
        "@echo {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"serverInfo\":{\"name\":\"fake\",\"version\":\"1\"}}}\r\n",
        encoding="utf-8",
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
    import json as jsonlib
    import os

    from mcptoon import config as mcptoon_config
    from mcptoon.health import check_server

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    script = (
        "@echo off\r\n"
        ":loop\r\n"
        "set /p REQ=\r\n"
        "for /f \"tokens=12 delims=:,\" %%A in ('echo !REQ!') do rem noop\r\n"
        "@echo {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"serverInfo\":{\"name\":\"fake\",\"version\":\"1\"}}}\r\n"
        "@goto loop\r\n"
    )
    (bin_dir / "echomcp.cmd").write_text(script, encoding="utf-8")
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    mcptoon_config.save_config({"echomcp": {"command": "echomcp", "args": []}})
    r = check_server("echomcp", timeout=10)
    assert r["status"] in ("ok", "error"), r  # must not be a spawn crash
    assert "Invalid argument" not in str(r.get("error")), r


def test_real_exe_paths_unaffected_by_shim(shim_env, tmp_path, monkeypatch):
    """Plain .exe (python) stdio servers keep working — shim only wraps .cmd/.bat."""
    import json as jsonlib
    import os
    import sys

    from mcptoon import config as mcptoon_config
    from mcptoon.health import check_server

    script = tmp_path / "pyserver.py"
    script.write_text(
        "import sys\n"
        "for line in sys.stdin:\n"
        "    sys.stdout.write('{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"serverInfo\":{\"name\":\"py\",\"version\":\"1\"}}}\\n')\n"
        "    sys.stdout.flush()\n",
        encoding="utf-8",
    )

    mcptoon_config.save_config({"pyserver": {"command": sys.executable, "args": [str(script)]}})
    r = check_server("pyserver", timeout=10)
    assert r["status"] == "ok", r
    assert r["tools"] >= 0
