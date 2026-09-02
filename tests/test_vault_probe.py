"""T-042: connectivity probe (mocked + real) + vault API routes."""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def vault_env(tmp_path, monkeypatch):
    from toondeck.deck.vault.internal import store as store_mod

    class FakeKeyring:
        def __init__(self) -> None:
            self.data: dict[str, str] = {}

        def set_password(self, service, account, secret):
            self.data[account] = secret

        def get_password(self, service, account):
            return self.data.get(account)

        def delete_password(self, service, account):
            self.data.pop(account, None)

    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    fake = FakeKeyring()
    monkeypatch.setattr(store_mod, "_keyring", fake)
    return fake


@pytest.fixture
def local_probe_server():
    """Tiny localhost HTTP server to classify 200/401 without external calls."""
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get("Authorization") == "Bearer good-key-123456":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"data": []}')
            else:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b'{"error": "bad key"}')

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield srv, "good-key-123456"
    srv.shutdown()


def test_probe_ok_and_unauthorized(vault_env, local_probe_server, monkeypatch):
    from toondeck.deck.vault import test

    srv, good_key = local_probe_server
    url = f"http://127.0.0.1:{srv.server_address[1]}/models"

    catalog = {
        "probe": {"id": "probe", "display_name": "Probe", "env_var": "PROBE_API_KEY",
                  "base_url": url, "test_url": url, "auth_style": "bearer", "local": False},
    }
    import toondeck.deck.vault.internal.providers as provs

    monkeypatch.setattr(provs, "load_all", lambda: catalog)
    monkeypatch.setattr("toondeck.deck.vault.store.get_secret", lambda pid: good_key)

    r = test("probe")
    assert r["ok"] is True and r["status"] == 200

    monkeypatch.setattr("toondeck.deck.vault.store.get_secret", lambda pid: "wrong-key")
    r2 = test("probe")
    assert r2["ok"] is False and r2["status"] == 401

    # metadata got the result recorded
    vf = __import__("toondeck.deck.vault.internal", fromlist=["vault_file"]).vault_file()
    data = json.loads(vf.read_text(encoding="utf-8"))
    assert data["providers"]["probe"]["last_test"]["ok"] is False


def test_probe_timeout_classified(vault_env, monkeypatch):
    from toondeck.deck.vault import test

    catalog = {
        "slow": {"id": "slow", "display_name": "Slow", "env_var": "SLOW_API_KEY",
                 "base_url": "http://127.0.0.1:9", "test_url": "http://127.0.0.1:9/x",
                 "auth_style": "bearer", "local": False},
    }
    import toondeck.deck.vault.internal.providers as provs

    monkeypatch.setattr(provs, "load_all", lambda: catalog)
    monkeypatch.setattr("toondeck.deck.vault.store.get_secret", lambda pid: None)
    r = test("slow", timeout=2.0)
    assert r["ok"] is False
    assert r["status"] is None
    assert r["error"]


def test_vault_api_routes_full_cycle(vault_env):
    c = TestClient(__import__("toondeck.deck.api.app", fromlist=["create_app"]).create_app())
    # state → empty
    r = c.get("/api/vault/state")
    assert r.status_code == 200
    body = r.json()
    assert body["stored_count"] == 0
    assert len(body["providers"]) == 8
    # set → stored; secret must NOT come back anywhere
    r2 = c.post("/api/vault/keys", json={"provider": "openai", "secret": "sk-VAULTTEST123456"})
    assert r2.json()["ok"] is True
    blob = json.dumps(c.get("/api/vault/state").json())
    assert "sk-VAULTTEST123456" not in blob
    # delete
    r3 = c.request("DELETE", "/api/vault/keys/openai")
    assert r3.json()["ok"] is True
    assert c.get("/api/vault/state").json()["stored_count"] == 0


def test_vault_api_rejects_unknown_provider(vault_env):
    c = TestClient(__import__("toondeck.deck.api.app", fromlist=["create_app"]).create_app())
    r = c.post("/api/vault/keys", json={"provider": "ghost", "secret": "x"})
    assert r.json()["ok"] is False


def test_vault_test_route_mocked(vault_env, local_probe_server, monkeypatch):
    from toondeck.deck.vault.internal import providers as provs

    srv, good_key = local_probe_server
    catalog = {
        "probe": {"id": "probe", "display_name": "Probe", "env_var": "PROBE_API_KEY",
                  "base_url": "x", "test_url": f"http://127.0.0.1:{srv.server_address[1]}/models",
                  "auth_style": "bearer", "local": False},
        **{k: v for k, v in provs.load_all().items() if k != "probe"},
    }
    monkeypatch.setattr(provs, "load_all", lambda: catalog)
    monkeypatch.setattr("toondeck.deck.vault.store.get_secret", lambda pid: good_key if pid == "probe" else None)

    c = TestClient(__import__("toondeck.deck.api.app", fromlist=["create_app"]).create_app())
    r = c.post("/api/vault/test/probe")
    assert r.status_code == 200
    assert r.json()["ok"] is True
