"""UX-A2 RED→GREEN: inventory parallel probing + hard deadlines + import cache-bust.

R4 live-fire: real-config refresh=1 took 6.1s — the serial loop pays the SUM
of per-server latencies. And the same hang class as health applies: mcptoon's
stdio readline has no timeout, so a server that goes quiet after initialize
hangs the whole inventory. UX-A2: parallel fleet probing (wall ≈ slowest),
deadline verdicts (timeout instead of hang), and import_selected() busting
the 2-minute cache so the UI never shows stale numbers after an import.
"""

import json
import sys
import time

import pytest


def _fake_server(tmp_path, name: str, tools: list[str], *, sleep_s: float = 0.0,
                 silent_after_init: bool = False):
    """Fake stdio MCP server. sleep_s delays the tools/list reply only."""
    srv = tmp_path / f"{name}_srv.py"
    payload = ",".join(f"{{'name':'{t}','description':'d{t}'}}" for t in tools)
    if silent_after_init:
        handler = (
            "    if req.get('method') == 'initialize':\n"
            "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'protocolVersion':'2025-06-18','capabilities':{},'serverInfo':{'name':'s','version':'1'}}}\n"
            "        sys.stdout.write(json.dumps(resp) + '\\n'); sys.stdout.flush()\n"
            "    # everything after initialize: silence (the hang class)\n"
        )
    else:
        handler = (
            "    import time as _t\n"
            "    if req.get('method') == 'initialize':\n"
            "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'protocolVersion':'2025-06-18','capabilities':{},'serverInfo':{'name':'ok','version':'1'}}}\n"
            "        sys.stdout.write(json.dumps(resp) + '\\n'); sys.stdout.flush()\n"
            "    elif req.get('method') == 'tools/list':\n"
            f"        _t.sleep({sleep_s})\n"
            "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'tools':[" + payload + "]}}\n"
            "        sys.stdout.write(json.dumps(resp) + '\\n'); sys.stdout.flush()\n"
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
def inv_env(tmp_path, monkeypatch):
    """Hermetic mcptoon config + cache reset; returns the tmp_path."""
    from mcptoon import config as mcptoon_config

    cfg_file = tmp_path / "config.json"
    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(cfg_file))
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", cfg_file)
    monkeypatch.chdir(tmp_path)
    # keep discovery hermetic — the real machine's agent configs (claude-
    # desktop leftovers etc.) would otherwise leak 40 real tools into the counts
    import toondeck.deck.mcpdiscover.internal as mdi

    monkeypatch.setattr(mdi, "source_files", lambda home=None: [])
    import toondeck.deck.mcpdiscover as md

    md._CACHE["ts"] = 0.0
    md._CACHE["data"] = None
    yield tmp_path
    md._CACHE["ts"] = 0.0
    md._CACHE["data"] = None


def _seed_adopted(tmp_path, servers: dict):
    from mcptoon import config as mcptoon_config

    mcptoon_config.save_config(servers)


def test_inventory_probes_in_parallel(inv_env):
    """3 servers × 0.8s sleep: parallel wall ≈ max, serial ≈ sum."""
    import toondeck.deck.mcpdiscover as md

    _seed_adopted(inv_env, {
        f"s{i}": _fake_server(inv_env, f"s{i}", [f"t{i}"], sleep_s=0.8)
        for i in range(3)
    })
    t0 = time.time()
    inv = md.inventory(refresh=True)
    wall = time.time() - t0

    assert wall < 2.2, f"inventory took {wall:.1f}s — still serial (sum of sleeps)"
    assert inv["tools_total"] == 3
    assert all(s["status"] == "ok" for s in inv["servers"])


def test_inventory_silent_server_times_out(inv_env):
    """A server quiet after initialize becomes 'timeout' — inventory still returns."""
    import toondeck.deck.mcpdiscover as md

    _seed_adopted(inv_env, {
        "healthy": _fake_server(inv_env, "healthy", ["a", "b"]),
        "quiet": _fake_server(inv_env, "quiet", [], silent_after_init=True),
    })
    t0 = time.time()
    inv = md.inventory(refresh=True, timeout=2.0)
    wall = time.time() - t0

    assert wall < 8, f"inventory took {wall:.1f}s — hanging"
    by = {s["server"]: s for s in inv["servers"]}
    assert by["healthy"]["status"] == "ok"
    assert by["healthy"]["tool_count"] == 2
    assert by["quiet"]["status"] == "timeout"
    assert inv["tools_total"] == 2  # the silent server contributes nothing


def test_import_selected_busts_inventory_cache(inv_env, monkeypatch):
    """After a successful import the 2-minute cache is dead — next call re-probes."""
    import toondeck.deck.mcpdiscover as md

    _seed_adopted(inv_env, {
        "mine": _fake_server(inv_env, "mine", ["m1"]),
    })
    # a discovered-but-not-adopted candidate, found in a fake cursor config
    agent_cfg = inv_env / "cursor-mcp.json"
    agent_cfg.write_text(
        json.dumps({"mcpServers": {
            "extra": _fake_server(inv_env, "extra", ["x1", "x2"]),
        }}),
        encoding="utf-8",
    )
    import toondeck.deck.mcpdiscover.internal as mdi

    monkeypatch.setattr(
        mdi, "source_files", lambda home=None: [("cursor", "json", agent_cfg)]
    )
    monkeypatch.setattr(
        "toondeck.deck.mcpdiscover.attributions",
        lambda home=None: {"mine": ["cursor"], "extra": ["cursor"]},
    )

    first = md.inventory(refresh=True)
    assert first["checked"] == 2 and md._CACHE["data"] is not None

    r = md.import_selected(["extra"])
    assert r["ok"] and r["imported"] == 1
    assert md._CACHE["data"] is None, "cache survived an import — UI would show stale numbers"

    second = md.inventory()  # no refresh=1 — must still reflect the new state
    by = {s["server"]: s for s in second["servers"]}
    assert by["extra"]["adopted"] is True
    assert second["checked"] == 2
