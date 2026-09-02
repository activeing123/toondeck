"""T-041: resolve_env + launch env injection — keys flow child-ward only."""

import sys
import time

import pytest


class FakeKeyring:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def set_password(self, service, account, secret):
        self.data[account] = secret

    def get_password(self, service, account):
        return self.data.get(account)

    def delete_password(self, service, account):
        self.data.pop(account, None)


@pytest.fixture
def vault_env(tmp_path, monkeypatch):
    from toondeck.deck.vault.internal import store as store_mod

    fake = FakeKeyring()
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    monkeypatch.setattr(store_mod, "_keyring", fake)
    return fake


def test_resolve_env_returns_env_map_for_stored_providers(vault_env):
    from toondeck.deck.vault import resolve_env, set_key

    set_key("deepseek", "sk-DEEPSEEKFAKE000000")
    env = resolve_env(["deepseek"])
    assert env == {"DEEPSEEK_API_KEY": "sk-DEEPSEEKFAKE000000"}


def test_resolve_env_skips_missing_providers(vault_env):
    from toondeck.deck.vault import resolve_env

    assert resolve_env(["anthropic"]) == {}
    assert resolve_env([]) == {}


def test_alias_env_maps_provider_secret_to_target_var(vault_env):
    """{target_var: provider_id} -> {target_var: secret}; secret never leaves backend."""
    from toondeck.deck.vault import alias_env, set_key

    set_key("deepseek", "sk-ALIASMAPTEST000000")
    env = alias_env({"ANTHROPIC_AUTH_TOKEN": "deepseek"})
    assert env == {"ANTHROPIC_AUTH_TOKEN": "sk-ALIASMAPTEST000000"}
    assert alias_env({"X": "nope"}) == {}


def test_delete_key_removes_secret(vault_env):
    from toondeck.deck.vault import delete_key, get_state, set_key

    set_key("groq", "gsk-FAKE000000")
    r = delete_key("groq")
    assert r["ok"] is True
    st = get_state()
    groq = next(p for p in st["providers"] if p["id"] == "groq")
    assert groq["stored"] is False


def test_launch_injects_vault_env_and_logs_redact_it(tmp_path, monkeypatch):
    """End-to-end: keyring → child env → stdout echo → REDACTED in logs."""
    from toondeck.deck.agents import internal as agents_internal
    from toondeck.deck.agents import launch, status, stop
    from toondeck.deck.vault import set_key
    from toondeck.deck.vault.internal import store as store_mod

    fake = FakeKeyring()
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    monkeypatch.setattr(store_mod, "_keyring", fake)
    set_key("deepseek", "sk-INJECTEDKEY000000")

    echo_cmd = [
        sys.executable,
        "-c",
        "import os, time; print('env=' + os.environ.get('DEEPSEEK_API_KEY', 'MISSING'), flush=True); time.sleep(30)",
    ]
    adapters = {
        "envy": {
            "id": "envy",
            "display_name": "Envy",
            "launch_command": echo_cmd,
            "env_config_support": True,
        },
    }
    monkeypatch.setattr(agents_internal, "load_all", lambda: adapters)

    r = launch("envy", args=None, env_extra={"DEEPSEEK_API_KEY": "sk-INJECTEDKEY000000"})
    assert r["ok"] is True
    try:
        deadline = time.time() + 10
        logs = []
        while time.time() < deadline:
            logs = status("envy")["logs"]
            if any("env=" in x for x in logs):
                break
            time.sleep(0.2)
        assert any("env=" in x for x in logs), logs
        assert not any("sk-INJECTEDKEY" in x for x in logs), logs
        assert any("***REDACTED***" in x for x in logs)
    finally:
        stop("envy")
