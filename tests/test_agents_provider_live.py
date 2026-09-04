"""N-R12: live model lists + a one-shot chat test per provider.

The catalog used to ship hardcoded model names that go stale. Now:
- GET  /api/agents/providers/{name}/models/refresh → queries the provider's
  OpenAI-compatible (or Anthropic) /models endpoint with the stored key and
  caches the list on the profile
- POST /api/agents/providers/{name}/test → one tiny chat round-trip
  ("reply with exactly: pong") so a novice can verify a source in 3 seconds
- provider_catalog() merges the cached live models for configured profiles
"""

import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def provider_env(engine_env, monkeypatch, tmp_path):
    """A configured provider profile with a key + a fake httpx layer."""
    from toondeck.deck import agents as agents_mod

    agents_mod.add_profile("testprov", base_url="https://prov.test/v1", api_key="sk-test")

    class FakeResp:
        def __init__(self, payload):
            self._payload = payload
            self.status_code = 200

        def json(self):
            return self._payload

        def raise_for_status(self):
            return None

    calls = {}

    def fake_get(url, headers=None, timeout=None):
        calls["get_url"] = url
        calls["get_headers"] = headers or {}
        return FakeResp({"data": [{"id": "new-model-9"}, {"id": "new-model-9b"}]})

    def fake_post(url, headers=None, json=None, timeout=None):
        calls["post_url"] = url
        calls["post_headers"] = headers or {}
        calls["post_json"] = json
        return FakeResp(
            {"choices": [{"message": {"content": "pong"}}], "model": json["model"]}
        )

    import httpx

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)
    yield calls


def _client():
    return TestClient(__import__("toondeck.deck.api.app", fromlist=["create_app"]).create_app())


def test_refresh_pulls_live_models(provider_env):
    c = _client()
    r = c.get("/api/agents/providers/testprov/models/refresh")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "new-model-9" in body["models"]
    assert body["count"] == 2
    # cached: catalog now serves the live list for this profile
    cat = {p["id"]: p for p in c.get("/api/agents/providers").json()["providers"]}
    assert "new-model-9" in cat["testprov"]["models"]


def test_test_chat_round_trip(provider_env):
    c = _client()
    r = c.post("/api/agents/providers/testprov/test")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["reply"].strip().lower() == "pong"
    calls = provider_env
    assert calls["post_url"].endswith("/chat/completions")
    assert calls["post_headers"]["Authorization"] == "Bearer sk-test"
    assert calls["post_json"]["messages"][0]["content"].startswith("Reply")


def test_catalog_merges_cached_models_without_refresh(provider_env):
    # refresh once, then a plain catalog read serves the cache from disk
    c = _client()
    assert c.get("/api/agents/providers/testprov/models/refresh").json()["ok"] is True
    cat = {p["id"]: p for p in c.get("/api/agents/providers").json()["providers"]}
    assert cat["testprov"]["models_cache_count"] == 2
    assert "new-model-9" in cat["testprov"]["models"]
