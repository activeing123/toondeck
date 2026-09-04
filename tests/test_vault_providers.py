"""R48: user-defined vault providers + the config explainer data.

The shipped catalog (providers.json) is read-only and upgrade-safe; user
definitions live in TOONDECK_HOME/vault-providers.json and win on id
collision. A custom provider must work through the FULL chain: state view,
key storage in the OS keyring, launch env injection, connectivity probe.
"""

import json

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


def _client() -> TestClient:
    from toondeck.deck.api.app import create_app

    return TestClient(create_app())


def _good_provider(pid="mygateway", env="MYGATEWAY_API_KEY"):
    return {
        "id": pid,
        "display_name": "My Gateway",
        "env_var": env,
        "base_url": "https://gw.example.com/v1",
        "test_url": "https://gw.example.com/v1/models",
        "auth_style": "bearer",
    }


def test_add_and_list_user_provider(vault_env):
    c = _client()
    r = c.post("/api/vault/providers", json=_good_provider())
    assert r.status_code == 200
    assert r.json()["ok"] is True

    state = c.get("/api/vault/state").json()
    by = {p["id"]: p for p in state["providers"]}
    assert by["mygateway"]["env_var"] == "MYGATEWAY_API_KEY"
    assert by["mygateway"]["stored"] is False
    # built-ins still present
    assert "openai" in by and "anthropic" in by

    # persisted in the user layer file, not the package
    from toondeck.deck.vault.internal.providers import user_providers_file

    uf = user_providers_file()
    assert uf.is_file()
    assert "mygateway" in json.loads(uf.read_text(encoding="utf-8"))["providers"]


def test_validation_rejects_garbage(vault_env):
    c = _client()
    bad = _good_provider()
    bad["id"] = "../evil"
    assert c.post("/api/vault/providers", json=bad).json()["ok"] is False

    bad2 = _good_provider(pid="x2")
    bad2["base_url"] = "ftp://nope"
    assert c.post("/api/vault/providers", json=bad2).json()["ok"] is False

    bad3 = _good_provider(pid="x3")
    bad3["auth_style"] = "carrier-pigeon"
    r = c.post("/api/vault/providers", json=bad3)
    assert r.json()["ok"] is False
    assert "auth_style" in r.json()["error"]


def test_user_override_wins_but_package_file_untouched(vault_env):
    """Override a built-in's base_url — the package JSON must stay pristine."""
    pkg = __import__(
        "toondeck.deck.vault.internal", fromlist=["PROVIDERS_JSON"]
    ).PROVIDERS_JSON
    before = pkg.read_text(encoding="utf-8")

    c = _client()
    r = c.post(
        "/api/vault/providers",
        json={
            "id": "deepseek",
            "display_name": "DeepSeek (my proxy)",
            "env_var": "DEEPSEEK_API_KEY",
            "base_url": "https://my-proxy.local/v1",
            "test_url": "https://my-proxy.local/v1/models",
            "auth_style": "bearer",
        },
    )
    assert r.json()["ok"] is True
    state = c.get("/api/vault/state").json()
    by = {p["id"]: p for p in state["providers"]}
    assert by["deepseek"]["display_name"] == "DeepSeek (my proxy)"

    assert pkg.read_text(encoding="utf-8") == before, "package catalog is read-only"


def test_custom_provider_full_chain(vault_env):
    """Define → store key → launch env injection → state metadata."""
    from toondeck.deck import vault

    c = _client()
    assert c.post("/api/vault/providers", json=_good_provider()).json()["ok"] is True
    assert c.post(
        "/api/vault/keys", json={"provider": "mygateway", "secret": "sk-CUSTOM-123"}
    ).json()["ok"] is True

    env = vault.resolve_env(["mygateway"])
    assert env == {"MYGATEWAY_API_KEY": "sk-CUSTOM-123"}

    state = c.get("/api/vault/state").json()
    mine = next(p for p in state["providers"] if p["id"] == "mygateway")
    assert mine["stored"] is True
    blob = json.dumps(state)
    assert "sk-CUSTOM-123" not in blob, "secret never crosses to the browser"


def test_remove_user_provider_but_not_builtins(vault_env):
    c = _client()
    c.post("/api/vault/providers", json=_good_provider())
    assert c.request("DELETE", "/api/vault/providers/mygateway").json()["ok"] is True
    assert c.request("DELETE", "/api/vault/providers/openai").json()["ok"] is False
    ids = {p["id"] for p in c.get("/api/vault/state").json()["providers"]}
    assert "mygateway" not in ids and "openai" in ids
