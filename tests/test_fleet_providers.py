"""T-069: fleet overview dashboard + provider catalog (mature-model UX)."""

import pytest


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    cfg_file = tmp_path / "mcptoon-config.json"
    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(cfg_file))
    import mcptoon.config as mcfg

    monkeypatch.setattr(mcfg, "CONFIG_FILE", cfg_file)
    mcfg.save_config({"echo": {"command": "x", "args": []}})
    monkeypatch.setattr(
        "toondeck.deck.mcpdiscover.attributions", lambda home=None: {"echo": ["cursor"]}
    )
    return tmp_path


def test_fleet_overview_aggregates_everything(home):
    from toondeck.deck.fleet import overview

    o = overview()
    # mcptoon engine numbers
    assert o["mcptoon"]["servers_total"] == 1
    assert o["mcptoon"]["engine"] is True
    # discovery funnel
    assert "discovered_total" in o["mcptoon"]
    assert o["mcptoon"]["sources_scanned"] >= 5
    # agents side
    assert o["agents"]["total"] >= 7
    assert o["agents"]["cli_capable"] >= 1
    # skills side
    assert o["skills"]["total"] >= 0 and "views_ok" in o["skills"]


def test_provider_catalog_shape(home):
    from toondeck.deck.agents import provider_catalog

    cat = provider_catalog()
    ids = [p["id"] for p in cat]
    for must in ("anthropic", "openai", "deepseek", "dashscope", "openrouter", "ollama"):
        assert must in ids
    anthropic = next(p for p in cat if p["id"] == "anthropic")
    assert anthropic["base_url"].startswith("https://")
    assert len(anthropic["models"]) >= 2
    # configured flag reflects saved profiles
    assert all(p["configured"] is False for p in cat)


def test_provider_catalog_configured_after_profile_save(home):
    from toondeck.deck import agents

    agents.add_profile("dashscope", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")
    cat = agents.provider_catalog()
    ds = next(p for p in cat if p["id"] == "dashscope")
    assert ds["configured"] is True


def test_api_fleet_and_providers_routes(home):
    from fastapi.testclient import TestClient

    from toondeck.deck.api.app import create_app

    c = TestClient(create_app())
    r = c.get("/api/fleet/overview")
    assert r.status_code == 200
    assert "mcptoon" in r.json()
    r2 = c.get("/api/agents/providers")
    assert r2.status_code == 200
    assert any(p["id"] == "anthropic" for p in r2.json()["providers"])
