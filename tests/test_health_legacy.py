"""UX-A1 RED→GREEN: legacy health probe (root fix for the 240s hang).

R1/R2 evidence (2026-09-02): mcptoon.health.check_all builds MCPClient with
spec="auto" → sends the 2026-07-28 `server/discover` probe FIRST. MCP-SDK
servers (mcp_server_fetch 2026.8.18 verified) silently drop that unknown
method — no reply, not even a JSON-RPC error — and mcptoon's stdio
readline has no timeout, so the probe (and the whole endpoint) hangs forever.
spec="legacy" (initialize handshake first) works for every real server.

This ticket replaces the engine's probe path with a toondeck-owned legacy
probe: one daemon thread per server, joined with an overall deadline.
A server that never answers becomes status="timeout" — never a hang.
"""

import json
import sys
import time

import pytest


def _write_server(tmp_path, name: str, *, silent_after_init: bool, tools: list[str]):
    """Fake stdio MCP server: replies to initialize; optionally only to that.

    silent_after_init=True replicates mcp_server_fetch's observed behavior:
    initialize gets an answer, any other method is ignored forever.
    """
    srv = tmp_path / f"{name}_srv.py"
    tool_payload = ",".join(f"{{'name':'{t}','description':'d{t}'}}" for t in tools)
    if silent_after_init:
        handler = (
            "    if req.get('method') == 'initialize':\n"
            "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'protocolVersion':'2025-06-18','capabilities':{},'serverInfo':{'name':'silent','version':'1'}}}\n"
            "        sys.stdout.write(json.dumps(resp) + '\\n'); sys.stdout.flush()\n"
            "    # everything else: silence — the fetch behavior (R2 evidence)\n"
        )
    else:
        handler = (
            "    if req.get('method') == 'initialize':\n"
            "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'protocolVersion':'2025-06-18','capabilities':{},'serverInfo':{'name':'ok','version':'1'}}}\n"
            "    elif req.get('method') == 'tools/list':\n"
            f"        resp = {{'jsonrpc':'2.0','id':req['id'],'result':{{'tools':[{tool_payload}]}}}}\n"
            "    else:\n"
            "        resp = {'jsonrpc':'2.0','id':req.get('id'),'error':{'code':-32601,'message':'nope'}}\n"
            "    sys.stdout.write(json.dumps(resp) + '\\n'); sys.stdout.flush()\n"
        )
    srv.write_text(
        "import sys, json\n"
        "for line in sys.stdin:\n"
        "    line = line.strip()\n"
        "    if not line: continue\n"
        "    try: req = json.loads(line)\n"
        "    except Exception: continue\n"
        "    if 'id' not in req: continue\n"
        + handler,
        encoding="utf-8",
    )
    return {"transport": "stdio", "command": [sys.executable], "args": [str(srv)]}


@pytest.fixture
def legacy_env(tmp_path, monkeypatch):
    """Hermetic config: one healthy server + one silent (fetch-like) server."""
    from mcptoon import config as mcptoon_config

    cfg_file = tmp_path / "config.json"
    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(cfg_file))
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", cfg_file)
    # mcptoon sync/toggle paths derive sibling paths from the config file's
    # directory; keep every probe hermetic inside tmp_path.
    monkeypatch.chdir(tmp_path)
    cfg = {
        "echoes": _write_server(tmp_path, "echoes", silent_after_init=False, tools=["greet", "bye"]),
        "silentfetch": _write_server(tmp_path, "silent", silent_after_init=True, tools=[]),
    }
    cfg_file.write_text(json.dumps({"servers": cfg}), encoding="utf-8")
    return tmp_path


def test_legacy_probe_silent_server_times_out_not_hangs(legacy_env):
    """A server that ignores requests after initialize becomes 'timeout', fast."""
    from toondeck.deck.engine import _internal

    t0 = time.time()
    results = _internal.check_all_legacy(timeout=3.0)
    wall = time.time() - t0

    assert wall < 10, f"probe took {wall:.1f}s — it is hanging, the fix failed"
    by = {r["server"]: r for r in results}
    assert by["echoes"]["status"] == "ok"
    assert by["echoes"]["tools"] == 2
    assert by["silentfetch"]["status"] == "timeout"
    assert by["silentfetch"]["error"]


def test_legacy_probe_ok_shape(legacy_env):
    """Results carry the HealthResult shape the frontend already renders."""
    from toondeck.deck.engine import _internal

    results = _internal.check_all_legacy(timeout=5.0)
    for r in results:
        assert set(r) >= {"server", "transport", "status", "tools", "latency_ms", "error"}
        assert r["status"] in {"ok", "error", "timeout", "no-config"}


def test_health_route_uses_legacy_probe(legacy_env):
    """The route serves the legacy probe verdicts for every configured server."""
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    r = c.get("/api/mcp/health?timeout=3")
    assert r.status_code == 200
    body = r.json()
    assert body["checked"] == 2
    by = {x["server"]: x for x in body["results"]}
    assert by["echoes"]["status"] == "ok"
    assert by["silentfetch"]["status"] == "timeout"
