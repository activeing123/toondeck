"""Keychain failures must travel as a stable token, never a raw exception.

CLEAN-ROOM AUDIT 2026-09-05, cross-platform leg. This machine has a Windows
credential manager, so `keyring.set_password` never failed here and the suite
never looked at that branch. On a headless Linux server (no Secret Service) or
a bare container, it raises — and both save paths used to forward the raw
English exception text into a toast. The user sees a wall of unfamiliar words
and no next action; the deck looks broken when the environment is merely
missing a component.

Contract: `error` is a machine-readable token the UI can localize; the real
cause survives in `detail` for triage.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path / "deck"))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "home"))
    return tmp_path


class _Boom(Exception):
    pass


def test_add_profile_reports_keyring_failure_as_a_token(isolated_home, monkeypatch):
    from toondeck.deck import agents

    def raise_no_backend(*a, **k):
        raise _Boom("No recommended backend was available")

    monkeypatch.setitem(__import__("sys").modules, "keyring", type("M", (), {"set_password": raise_no_backend})())
    res = agents.add_profile("myproxy", base_url="https://x/v1", api_key="sk-123")
    assert res["ok"] is False
    assert res["error"] == "keyring_unavailable", "UI needs a stable token, not prose"
    assert "No recommended backend" in res["detail"], "the cause must survive for triage"
    # and nothing secret leaked into the report
    assert "sk-123" not in repr(res)


def test_edit_profile_reports_the_same_token(isolated_home, monkeypatch):
    from toondeck.deck import agents

    agents.add_profile("plain", base_url="https://x/v1")  # no key → works

    def raise_no_backend(*a, **k):
        raise _Boom("Secret Service unreachable")

    monkeypatch.setitem(__import__("sys").modules, "keyring", type("M", (), {"set_password": raise_no_backend})())
    res = agents.edit_profile("plain", api_key="sk-456")
    assert res["ok"] is False
    assert res["error"] == "keyring_unavailable"
    assert "sk-456" not in repr(res)


def test_vault_set_key_reports_the_same_token(isolated_home, monkeypatch):
    from toondeck.deck import vault

    def raise_no_backend(*a, **k):
        raise _Boom("no keychain on this box")

    monkeypatch.setattr(vault.store, "set_secret", raise_no_backend)
    res = vault.set_key("anthropic", "sk-ant-789")
    assert res["ok"] is False
    assert res["error"] == "keyring_unavailable"
    assert "no keychain on this box" in res["detail"]
    assert "sk-ant-789" not in repr(res)


def test_no_backend_message_escapes_into_the_api_layer(isolated_home, monkeypatch):
    """The endpoint must hand the token through untouched, not re-wrap it."""
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    def raise_no_backend(*a, **k):
        raise _Boom("No recommended backend was available")

    from toondeck.deck.vault.internal import store as vault_store

    monkeypatch.setattr(vault_store, "set_secret", raise_no_backend)
    client = TestClient(create_app())
    r = client.post("/api/vault/keys", json={"provider": "openai", "secret": "sk-leak-check"})
    assert r.status_code == 200
    body = r.json()
    assert body["error"] == "keyring_unavailable"
    assert "sk-leak-check" not in r.text
