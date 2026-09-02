"""T-002 RED→GREEN: `toondeck` CLI entrypoint contract."""

import pytest

import toondeck.cli as cli


def test_cli_module_exists_and_exposes_main():
    assert callable(cli.main)


def test_build_server_returns_uvicorn_config(monkeypatch):
    """main() = uvicorn.run(build_server()) — testable without binding a port."""
    cfg = cli.build_server(port=8123, no_browser=True)
    assert cfg["port"] == 8123
    assert cfg["host"] in ("127.0.0.1", "localhost")
    assert callable(cfg["app"])


def test_port_collision_is_reported_not_crashed(monkeypatch):
    """Occupied port → clean error message, exit code 1, no traceback."""
    import socket

    blocker = socket.socket()
    blocker.bind(("127.0.0.1", 0))
    port = blocker.getsockname()[1]
    blocker.listen(1)
    try:
        with pytest.raises(SystemExit) as ei:
            cli._ensure_port_free("127.0.0.1", port)
        assert ei.value.code == 1
    finally:
        blocker.close()


def test_open_browser_called_once_when_enabled(monkeypatch):
    calls = []
    monkeypatch.setattr("webbrowser.open", lambda url: calls.append(url) or True)
    cli._open_console("http://127.0.0.1:8123", no_browser=False)
    assert calls == ["http://127.0.0.1:8123"]

    calls.clear()
    cli._open_console("http://127.0.0.1:8123", no_browser=True)
    assert calls == []
