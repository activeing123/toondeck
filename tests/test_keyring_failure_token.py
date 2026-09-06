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


# ── leg 2: the READ path ──────────────────────────────────────────────────
# set_key got token-ized above; the probe did not. `test()` called
# store.get_secret() OUTSIDE its try block, whose excepts only name HTTPError /
# URLError / TimeoutError / OSError — so on a box with no keychain backend the
# raise escaped the handler entirely, FastAPI answered 500 with the reason under
# `detail`, and the UI's `!r.ok && r.error` guard matched neither branch. The
# probe button looked dead: no toast, no error, no explanation.


def test_vault_probe_reports_keyring_failure_as_a_token(isolated_home, monkeypatch):
    from toondeck.deck import vault

    def raise_no_backend(*a, **k):
        raise _Boom("no keychain on this box")

    monkeypatch.setattr(vault.store, "get_secret", raise_no_backend)
    res = vault.test("openai")
    assert res["ok"] is False
    assert res["error"] == "keyring_unavailable", "the UI needs a stable token, not a crash"
    assert "no keychain on this box" in res["detail"]


def test_vault_probe_endpoint_never_returns_a_500(isolated_home, monkeypatch):
    """The regression the clean-room gate now also proves: honest JSON, HTTP 200."""
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app
    from toondeck.deck.vault.internal import store as vault_store

    def raise_no_backend(*a, **k):
        raise _Boom("No recommended backend was available")

    monkeypatch.setattr(vault_store, "get_secret", raise_no_backend)
    client = TestClient(create_app())
    r = client.post("/api/vault/test/openai")
    assert r.status_code == 200, f"a missing keychain must not surface as a 500 (got {r.status_code})"
    body = r.json()
    assert body["ok"] is False
    assert body["error"] == "keyring_unavailable"
    assert "detail" in body, "the cause must survive for triage"


# ── leg 3: the INJECTION path (N5) ────────────────────────────────────────
# `test()` got wrapped; `resolve_env()` and `alias_env()` deliberately did not,
# on the reasoning that nothing in the UI could send use_vault and only the
# CLI/API could reach them. That premise died this session: the Agents page now
# has an "inject vault keys at launch" switch, so an ordinary click arrives
# here. And metadata outlives keyring health — a key stored on a working
# machine leaves `stored: true` behind after the keyring dies (new box, wiped
# credentials, a Linux session without Secret Service), so the provider still
# looks injectable right up until get_secret() throws.


def _no_backend(*a, **k):
    raise _Boom("No recommended backend was available")


def _one_stored_provider(monkeypatch):
    from toondeck.deck.vault.internal import meta as vault_meta

    monkeypatch.setattr(
        vault_meta, "load_all", lambda: {"providers": {"openai": {"stored": True}}}
    )


def test_resolve_env_raises_a_typed_error_not_a_raw_one(isolated_home, monkeypatch):
    from toondeck.deck import vault

    _one_stored_provider(monkeypatch)
    monkeypatch.setattr(vault.store, "get_secret", _no_backend)
    with pytest.raises(vault.VaultUnavailable):
        vault.resolve_env()


def test_alias_env_raises_the_same_typed_error(isolated_home, monkeypatch):
    from toondeck.deck import vault

    monkeypatch.setattr(vault.store, "get_secret", _no_backend)
    with pytest.raises(vault.VaultUnavailable):
        vault.alias_env({"ANTHROPIC_AUTH_TOKEN": "openai"})


def test_launch_answers_a_token_instead_of_a_500(isolated_home, monkeypatch):
    """The user-visible contract. Refusing the launch is correct here — an
    agent started without the key the user just asked for would fail later
    with a provider-side "not authenticated", much harder to trace back to a
    checkbox. Unticking it is a real way out, so the envelope must carry both
    the token and the cause, over HTTP 200."""
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app
    from toondeck.deck.vault.internal import store as vault_store

    _one_stored_provider(monkeypatch)
    monkeypatch.setattr(vault_store, "get_secret", _no_backend)
    client = TestClient(create_app())
    r = client.post("/api/agents/some-agent/launch", json={"use_vault": True})
    assert r.status_code == 200, f"must not surface as a 500 (got {r.status_code})"
    body = r.json()
    assert body["ok"] is False
    assert body["error"] == "keyring_unavailable"
    assert "No recommended backend" in body["detail"]


def test_launch_without_the_checkbox_never_touches_the_keyring(isolated_home, monkeypatch):
    """The switch defaults to off, and off must mean off: a broken keyring may
    not stop anyone from launching on the agent's own config."""
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app
    from toondeck.deck.vault.internal import store as vault_store

    calls = []
    monkeypatch.setattr(vault_store, "get_secret", lambda *a, **k: calls.append(a) or "x")
    client = TestClient(create_app())
    client.post("/api/agents/some-agent/launch", json={"use_vault": False})
    assert calls == [], "a plain launch must not read the vault at all"
