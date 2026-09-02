"""T-024 RED→GREEN: source watcher — file changes trigger automatic reconcile."""

import time

import pytest


@pytest.fixture
def world(tmp_path, monkeypatch):
    src = tmp_path / "skills"
    src.mkdir()
    monkeypatch.setenv("TOONDECK_SKILLS_DIR", str(src))
    monkeypatch.setenv("TOONDECK_VIEWS_DIR", str(tmp_path / "views"))
    return {"src": src, "views": tmp_path / "views"}


def _mk_skill(src, name):
    d = src / name
    d.mkdir()
    (d / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: Skill {name}\n---\n\n# {name}\n", encoding="utf-8"
    )
    return d


def test_watcher_status_lifecycle(world):
    from toondeck.deck.skills import watcher

    assert watcher("status")["running"] is False
    started = watcher("start")
    assert started["running"] is True
    try:
        assert watcher("status")["running"] is True
    finally:
        stopped = watcher("stop")
    assert stopped["running"] is False
    assert watcher("status")["running"] is False


def test_watcher_reconciles_on_source_change(world):
    from toondeck.deck.skills import sync_all, watcher

    sync_all()  # baseline views
    watcher("start")
    try:
        _mk_skill(world["src"], "hot-skill")
        deadline = time.time() + 15
        status = {}
        while time.time() < deadline:
            status = watcher("status")
            if status["events"] >= 1 and status["last_actions"]:
                break
            time.sleep(0.3)
        assert status["events"] >= 1, "watcher must observe the source change"
        assert any("farm/hot-skill" in a for a in status["last_actions"]), status["last_actions"]
        assert (world["views"] / ".codex" / "skills" / "hot-skill" / "SKILL.md").is_file()
    finally:
        watcher("stop")


def test_watcher_stop_terminates_promptly(world):
    from toondeck.deck.skills import watcher

    watcher("start")
    t0 = time.time()
    watcher("stop")
    assert time.time() - t0 < 5, "stop must join the daemon quickly"


def test_watcher_unknown_action_rejected(world):
    from toondeck.deck.skills import watcher

    assert watcher("dance")["ok"] is False
