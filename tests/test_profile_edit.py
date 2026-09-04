"""R46 RED→GREEN: profile EDIT without the data-loss trap.

add_profile (T-067) REPLACES the whole entry — editing a base_url through it
silently drops the "keyring" flag, so launch stops injecting the stored key.
edit_profile is the merge-based editor the UI dialog uses: change only what
the user actually typed, keep the rest.
"""

import keyring
import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    # fake keyring: tests must never touch the real OS credential store
    store: dict[tuple[str, str], str] = {}
    monkeypatch.setattr(keyring, "set_password", lambda svc, user, pw: store.__setitem__((svc, user), pw))
    monkeypatch.setattr(keyring, "get_password", lambda svc, user: store.get((svc, user)))
    monkeypatch.setattr(keyring, "delete_password", lambda svc, user: store.pop((svc, user), None))
    return tmp_path


def test_edit_base_url_keeps_stored_key(home):
    """THE trap: url-only edit must not sever the keyring injection."""
    from toondeck.deck import agents

    agents.add_profile("px", base_url="https://old/v1", api_key="sk-keep-me")
    r = agents.edit_profile("px", base_url="https://new/v1")
    assert r["ok"] is True
    entry = agents.list_profiles()["px"]
    assert entry["base_url"] == "https://new/v1"
    assert entry["keyring"] is True, "url edit must keep the keyring flag"
    env = agents.profile_launch_env("px")
    assert env["OPENAI_BASE_URL"] == "https://new/v1"
    assert env["ANTHROPIC_API_KEY"] == "sk-keep-me"


def test_edit_can_replace_the_key(home):
    from toondeck.deck import agents

    agents.add_profile("px", base_url="https://x/v1", api_key="sk-old")
    r = agents.edit_profile("px", api_key="sk-new")
    assert r["ok"] is True
    env = agents.profile_launch_env("px")
    assert env["ANTHROPIC_API_KEY"] == "sk-new"


def test_edit_unknown_profile_is_clean_error(home):
    from toondeck.deck import agents

    r = agents.edit_profile("ghost", base_url="https://x/v1")
    assert r["ok"] is False
    assert "ghost" in r["error"]


def test_edit_bad_name_is_clean_error(home):
    from toondeck.deck import agents

    agents.add_profile("px")
    assert agents.edit_profile("../evil", base_url="https://x/v1")["ok"] is False


def test_put_route_edits(home):
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    assert c.post("/api/agents/profiles", json={"name": "gw", "base_url": "https://g/v1"}).json()["ok"] is True
    r = c.put("/api/agents/profiles/gw", json={"base_url": "https://g2/v1"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert c.get("/api/agents/profiles").json()["profiles"]["gw"]["base_url"] == "https://g2/v1"
    # unknown name → clean 200 ok:false (deck error contract)
    r2 = c.put("/api/agents/profiles/ghost", json={"base_url": "https://x/v1"})
    assert r2.status_code == 200
    assert r2.json()["ok"] is False
