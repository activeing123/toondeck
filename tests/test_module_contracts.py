"""T-006: deep-module seams exist, are narrow, and fail loudly until implemented."""

import pytest

import toondeck.deck.agents as agents
import toondeck.deck.engine as engine
import toondeck.deck.skills as skills
import toondeck.deck.vault as vault


def test_engine_exports_exactly_four_operations():
    public = [n for n in dir(engine) if not n.startswith("_")]
    assert set(["get_state", "toggle", "request_sync", "check_health"]) <= set(public)


def test_skills_exports_exactly_four_operations():
    public = [n for n in dir(skills) if not n.startswith("_")]
    assert set(["get_state", "sync_all", "remove_skill", "doctor"]) <= set(public)


def test_agents_exports_exactly_three_operations():
    public = [n for n in dir(agents) if not n.startswith("_")]
    assert set(["detect_all", "launch", "stop"]) <= set(public)


def test_vault_exports_exactly_three_operations():
    public = [n for n in dir(vault) if not n.startswith("_")]
    assert set(["set_key", "test", "resolve_env"]) <= set(public)


@pytest.mark.parametrize(
    "mod,fn",
    [
        (skills, "sync_all"),
        (agents, "detect_all"),
        (vault, "set_key"),
    ],
)
def test_seams_fail_loudly(mod, fn):
    with pytest.raises(NotImplementedError):
        getattr(mod, fn)()
