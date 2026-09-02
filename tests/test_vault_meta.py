"""T-040 RED→GREEN: provider catalog (8 classes) + vault metadata model."""

import json

EIGHT = {
    "openai",
    "anthropic",
    "openrouter",
    "gemini",
    "deepseek",
    "groq",
    "mistral",
    "ollama",
}


def test_catalog_has_eight_providers_with_probe_info():
    from toondeck.deck.vault.internal import providers

    catalog = providers.load_all()
    assert set(catalog) == EIGHT
    for pid, p in catalog.items():
        assert p["id"] == pid
        assert p["display_name"]
        assert p["env_var"].endswith("_API_KEY") or pid == "ollama"
        assert p["test_url"].startswith("http")
        assert isinstance(p.get("local", False), bool)


def test_vault_metadata_roundtrip_and_zero_plaintext(tmp_path, monkeypatch):
    from toondeck.deck.vault.internal import meta

    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    meta.record_stored("openai")
    data = json.loads((tmp_path / "vault.json").read_text(encoding="utf-8"))
    assert data["providers"]["openai"]["stored"] is True
    assert "set_at" in data["providers"]["openai"]

    meta.record_test("openai", ok=True, status="ok")
    data = json.loads((tmp_path / "vault.json").read_text(encoding="utf-8"))
    assert data["providers"]["openai"]["last_test"]["ok"] is True

    meta.record_removed("openai")
    data = json.loads((tmp_path / "vault.json").read_text(encoding="utf-8"))
    assert data["providers"]["openai"]["stored"] is False


def test_secret_never_touches_metadata_file(tmp_path, monkeypatch):
    """The vault.json is metadata ONLY — the actual key must never land here."""
    from toondeck.deck.vault import set_key
    from toondeck.deck.vault.internal import store as store_mod

    class FakeKeyring:
        def set_password(self, service, account, secret):
            self.last = (service, account, secret)

        def get_password(self, service, account):
            return "sk-TESTSECRETVALUE123" if account == "openai" else None

        def delete_password(self, service, account):
            pass

    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    monkeypatch.setattr(store_mod, "_keyring", FakeKeyring())

    r = set_key("openai", "sk-TESTSECRETVALUE123")
    assert r["ok"] is True
    disk = (tmp_path / "vault.json").read_text(encoding="utf-8")
    assert "sk-TESTSECRETVALUE123" not in disk
