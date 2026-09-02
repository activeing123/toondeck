"""T-070: full local tool inventory — adopted + discovered, one honest number."""

import sys

import pytest


@pytest.fixture
def server_config(tmp_path, monkeypatch):
    from mcptoon import config as mcptoon_config

    cfg_file = tmp_path / "config.json"
    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(cfg_file))
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", cfg_file)

    def fake_server(tools):
        srv = tmp_path / f"srv_{abs(hash(tuple(tools)))}.py"
        payload = ",".join(
            f"{{'name':'{n}','description':'d{n}'}}" for n in tools
        )
        srv.write_text(
            "import sys, json\n"
            "for line in sys.stdin:\n"
            "    req = json.loads(line)\n"
            "    if 'id' not in req: continue\n"
            "    if req.get('method') == 'initialize':\n"
            "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'protocolVersion':'2025-06-18','capabilities':{},'serverInfo':{'name':'t','version':'1'}}}\n"
            "    elif req.get('method') == 'tools/list':\n"
            f"        resp = {{'jsonrpc':'2.0','id':req['id'],'result':{{'tools':[{payload}]}}}}\n"
            "    else:\n"
            "        resp = {'jsonrpc':'2.0','id':req.get('id'),'error':{'code':-32601,'message':'nope'}}\n"
            "    sys.stdout.write(json.dumps(resp) + '\\n')\n"
            "    sys.stdout.flush()\n",
            encoding="utf-8",
        )
        return {"command": sys.executable, "args": [str(srv)]}

    mcptoon_config.save_config({"tooly": fake_server(["greet"])})

    # a discovered-but-not-adopted server, found in a fake cursor config
    disc = fake_server(["alpha", "beta"])
    agent_cfg = tmp_path / "cursor-mcp.json"
    import json

    agent_cfg.write_text(
        json.dumps({"mcpServers": {"extra": disc}}), encoding="utf-8"
    )
    import toondeck.deck.mcpdiscover.internal as mdi

    monkeypatch.setattr(
        mdi, "source_files", lambda home=None: [("cursor", "json", agent_cfg)]
    )
    monkeypatch.setattr(
        "toondeck.deck.mcpdiscover.attributions",
        lambda home=None: {"tooly": ["cursor"], "extra": ["cursor"]},
    )
    # fresh cache for every test
    import toondeck.deck.mcpdiscover as md

    md._CACHE["ts"] = 0.0
    md._CACHE["data"] = None
    return tmp_path


def test_inventory_merges_adopted_and_discovered(server_config):
    import toondeck.deck.mcpcompat  # noqa: F401

    from toondeck.deck.mcpdiscover import inventory

    inv = inventory(refresh=True)
    by = {s["server"]: s for s in inv["servers"]}
    assert by["tooly"]["adopted"] is True and by["tooly"]["tool_count"] == 1
    assert by["extra"]["adopted"] is False and by["extra"]["tool_count"] == 2
    assert inv["tools_total"] == 3
    assert inv["checked"] == 2
    assert inv["by_source"]["cursor"] == 3  # tooly attributed to cursor + extra


def test_inventory_cached_until_refresh(server_config):
    import toondeck.deck.mcpcompat  # noqa: F401

    from toondeck.deck import mcpdiscover as md

    inv1 = md.inventory()
    inv2 = md.inventory()
    assert inv1 == inv2
    # busting the cache actually re-probes
    md._CACHE["ts"] = 0.0
    inv3 = md.inventory()
    assert inv3["checked"] == 2


def test_api_inventory_route(server_config):
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    r = c.get("/api/mcp/tools?refresh=1")
    assert r.status_code == 200
    body = r.json()
    assert body["tools_total"] == 3
