"""MCP tool browsing: per-server tool names via mcptoon MCPClient (shim active)."""

import sys

import pytest


@pytest.fixture
def server_config(tmp_path, monkeypatch):
    """One fake stdio MCP server that answers initialize + tools/list."""
    from mcptoon import config as mcptoon_config

    cfg_file = tmp_path / "config.json"
    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(cfg_file))
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", cfg_file)

    srv = tmp_path / "toolserver.py"
    srv.write_text(
        "import sys, json\n"
        "for line in sys.stdin:\n"
        "    req = json.loads(line)\n"
        "    if 'id' not in req: continue\n"
        "    if req.get('method') == 'initialize':\n"
        "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'protocolVersion':'2025-06-18','capabilities':{},'serverInfo':{'name':'t','version':'1'}}}\n"
        "    elif req.get('method') == 'tools/list':\n"
        "        resp = {'jsonrpc':'2.0','id':req['id'],'result':{'tools':[{'name':'greet','description':'say hi'}]}}\n"
        "    else:\n"
        "        resp = {'jsonrpc':'2.0','id':req.get('id'),'error':{'code':-32601,'message':'nope'}}\n"
        "    sys.stdout.write(json.dumps(resp) + '\\n')\n"
        "    sys.stdout.flush()\n",
        encoding="utf-8",
    )
    mcptoon_config.save_config(
        {"tooly": {"command": sys.executable, "args": [str(srv)]}}
    )
    return tmp_path


def test_tools_listing_returns_names(server_config):
    import toondeck.deck.mcpcompat  # noqa: F401

    from toondeck.deck.mcpdiscover import list_tools

    out = list_tools()
    assert out["checked"] == 1
    entry = out["servers"][0]
    assert entry["server"] == "tooly"
    assert entry["status"] == "ok"
    assert [t["name"] for t in entry["tools"]] == ["greet"]


def test_tools_listing_survives_dead_server(server_config, tmp_path):
    from mcptoon import config as mcptoon_config

    dead = tmp_path / "dier.py"
    dead.write_text("import sys; sys.exit(2)\n", encoding="utf-8")
    mcptoon_config.add_server("dead", {"command": sys.executable, "args": [str(dead)]})

    import toondeck.deck.mcpcompat  # noqa: F401

    from toondeck.deck.mcpdiscover import list_tools

    out = list_tools()
    by = {s["server"]: s for s in out["servers"]}
    assert by["dead"]["status"] == "error"
    assert by["tooly"]["status"] == "ok"


def test_api_tools_route(server_config):
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    r = c.get("/api/mcp/tools")
    assert r.status_code == 200
    body = r.json()
    assert body["checked"] >= 1
    assert any(s["server"] == "tooly" and s["tools"] for s in body["servers"])
