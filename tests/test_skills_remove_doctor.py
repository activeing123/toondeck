"""T-023 RED→GREEN: remove_skill (single deletion entry) + doctor (view exam)."""

import json

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


def test_remove_moves_source_to_graveyard(world):
    from toondeck.deck.skills import remove_skill, sync_all

    _mk_skill(world["src"], "doomed")
    sync_all()
    result = remove_skill("doomed")
    assert result["ok"] is True
    assert not (world["src"] / "doomed").exists()
    graveyard = world["src"].parent / "graveyard"
    assert list(graveyard.rglob("SKILL.md")), "skill content must be archived, reversible"
    ledger = world["src"].parent / "graveyard" / "ledger.json"
    entries = json.loads(ledger.read_text(encoding="utf-8"))
    assert any(e["skill"] == "doomed" for e in entries)


def test_remove_tears_down_all_views(world):
    from toondeck.deck.skills import remove_skill, sync_all

    _mk_skill(world["src"], "doomed")
    sync_all()
    remove_skill("doomed")
    assert not (world["views"] / ".claude" / "skills" / "doomed").exists()
    assert not (world["views"] / ".codex" / "skills" / "doomed").exists()
    assert not (world["views"] / ".roo" / "commands" / "doomed.md").exists()
    assert not (world["views"] / ".config" / "opencode" / "commands" / "doomed.md").exists()


def test_remove_of_unknown_skill_is_clean_error(world):
    from toondeck.deck.skills import remove_skill

    result = remove_skill("ghost")
    assert result["ok"] is False
    assert "not found" in result["error"].lower()


def test_remove_refuses_non_canon_names(world):
    from toondeck.deck.skills import remove_skill

    result = remove_skill(".system")
    assert result["ok"] is False


def test_doctor_reports_source_and_view_health(world):
    from toondeck.deck.skills import doctor, sync_all

    _mk_skill(world["src"], "good")
    bad = world["src"] / "badmd"
    bad.mkdir()
    (bad / "SKILL.md").write_text("# no frontmatter\n", encoding="utf-8")
    sync_all()
    report = doctor()
    assert report["source"]["total"] >= 2
    assert "badmd" in report["source"]["invalid"]
    for v in report["views"]:
        assert set(v) >= {"agent", "ok", "issues"}
        if v["agent"] in ("claude-code", "agents", "catpaw", "codex"):
            assert v["issues"] == [], f"{v['agent']} should be healthy: {v['issues']}"


def test_doctor_catches_drift_before_sync(world):
    from toondeck.deck.skills import doctor

    _mk_skill(world["src"], "good")
    stray = world["views"] / ".claude" / "skills"
    stray.mkdir(parents=True)
    (stray / "precious.txt").write_text("user content", encoding="utf-8")

    report = doctor()
    claude = next(v for v in report["views"] if v["agent"] == "claude-code")
    assert any("drift" in i.lower() for i in claude["issues"])
    assert report["summary"] != "ok"


def test_doctor_catches_dangling_farm_link(world):
    from toondeck.deck.skills import doctor, sync_all
    from toondeck.deck.skills.internal import links
    from toondeck.deck.skills.internal.views import view_path

    _mk_skill(world["src"], "good")
    sync_all()
    # break a farm link out-of-band: point it at a temp dir, then delete it
    link = view_path("codex") / "good"
    links.remove_link(link)
    ghost = world["src"].parent / "ghost-target"
    ghost.mkdir()
    (ghost / "SKILL.md").write_text("x", encoding="utf-8")
    links.make_link(link, ghost)
    import shutil

    shutil.rmtree(ghost)
    assert links.is_dangling(link) is True

    report = doctor()
    codex = next(v for v in report["views"] if v["agent"] == "codex")
    assert any("dangling" in i.lower() for i in codex["issues"])
    assert report["summary"] != "ok"
