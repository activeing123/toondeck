"""T-022 RED→GREEN: sync_all() incremental reconciliation.

Semantics ported from tongbu-skills v7 (productized):
- whole-dir views: link to source; a REAL dir at a view = drift → archive, replace
- farm view (codex): per-skill links; strays archived; `.system` local dir preserved
- flatten_md views (roo/opencode): <skill>.md (+ <skill>_*.py); stale derivations removed
- graveyard: archive/strays/<ts>_<name> + JSON ledger — reversible, never silently rm
"""

import json

import pytest


@pytest.fixture
def world(tmp_path, monkeypatch):
    src = tmp_path / "skills"
    src.mkdir()
    views = tmp_path / "views"
    views.mkdir()
    monkeypatch.setenv("TOONDECK_SKILLS_DIR", str(src))
    monkeypatch.setenv("TOONDECK_VIEWS_DIR", str(views))
    return {"src": src, "views": views}


def _mk_skill(src, name, extra_py=False):
    d = src / name
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: Skill {name}\n---\n\n# {name}\n", encoding="utf-8"
    )
    if extra_py:
        (d / "helper.py").write_text("VALUE = 1\n", encoding="utf-8")
    return d


AGENTS = ["claude-code", "agents", "catpaw", "codex", "roo", "opencode"]


def test_fresh_sync_creates_all_views(world):
    from toondeck.deck.skills import sync_all

    _mk_skill(world["src"], "demo")
    _mk_skill(world["src"], "other", extra_py=True)
    results = sync_all()
    by = {r["agent"]: r for r in results}
    assert set(by) == set(AGENTS)
    assert all(r["ok"] for r in results)
    # whole-dir views read through
    assert (world["views"] / ".claude" / "skills" / "demo" / "SKILL.md").is_file()
    assert (world["views"] / ".agents" / "skills" / "other" / "SKILL.md").is_file()
    # farm view: per-skill link
    assert (world["views"] / ".codex" / "skills" / "demo" / "SKILL.md").is_file()
    # flat views: derived .md + renamed .py attachment
    roo = world["views"] / ".roo" / "commands"
    assert (roo / "other.md").is_file()
    assert (roo / "other_helper.py").is_file()


def test_sync_is_idempotent(world):
    from toondeck.deck.skills import sync_all

    _mk_skill(world["src"], "demo")
    sync_all()
    again = {r["agent"]: r for r in sync_all()}
    created = [a for r in again.values() for a in r["actions"]]
    assert created == [] or all("create" not in a.lower() for a in created)


def test_real_dir_drift_is_archived_not_deleted(world):
    """A real dir at a whole-dir view = drift: archived to graveyard, then relinked."""
    from toondeck.deck.skills import sync_all

    _mk_skill(world["src"], "demo")
    stray = world["views"] / ".claude" / "skills"
    stray.mkdir(parents=True)
    (stray / "precious.txt").write_text("user content", encoding="utf-8")

    sync_all()
    # archived somewhere under the graveyard, content intact
    graveyard = world["src"].parent / "archive" / "strays"
    hits = list(graveyard.rglob("precious.txt"))
    assert hits, "stray content must be archived, never deleted"
    # and the view is now a link to the source
    assert (world["views"] / ".claude" / "skills" / "demo" / "SKILL.md").is_file()
    # ledger recorded the move
    ledger = world["src"].parent / "archive" / "ledger.json"
    entries = json.loads(ledger.read_text(encoding="utf-8"))
    assert any(e["reason"] == "drift" for e in entries)


def test_farm_strays_archived_but_local_dirs_preserved(world):
    from toondeck.deck.skills import sync_all

    _mk_skill(world["src"], "demo")
    farm = world["views"] / ".codex" / "skills"
    (farm / "ghost").mkdir(parents=True)
    (farm / "ghost" / "old.md").write_text("zombie", encoding="utf-8")
    (farm / ".system").mkdir(parents=True)
    (farm / ".system" / "keep.txt").write_text("system-local", encoding="utf-8")

    sync_all()
    assert (farm / ".system" / "keep.txt").is_file()  # coexistence preserved
    assert (farm / "demo" / "SKILL.md").is_file()  # canon link created
    graveyard = world["src"].parent / "archive" / "strays"
    assert list(graveyard.rglob("old.md")), "farm stray archived"


def test_dangling_farm_link_healed(world):
    from toondeck.deck.skills import sync_all
    from toondeck.deck.skills.internal import links

    _mk_skill(world["src"], "demo")
    _mk_skill(world["src"], "doomed")
    sync_all()
    # a skill dies out-of-band (source dir deleted by hand)
    import shutil

    shutil.rmtree(world["src"] / "doomed")
    sync_all()
    farm = world["views"] / ".codex" / "skills" / "doomed"
    assert links.is_dangling(farm) is False
    assert links.link_kind(farm) == "missing"  # removed, awaiting archive on remove_skill


def test_stale_flat_derivations_removed(world):
    from toondeck.deck.skills import sync_all

    _mk_skill(world["src"], "demo")
    sync_all()
    import shutil

    shutil.rmtree(world["src"] / "demo")
    sync_all()
    roo = world["views"] / ".roo" / "commands"
    assert not (roo / "demo.md").exists(), "derived file of a dead skill must go"


def test_flat_derivation_keeps_frontmatter_for_roo(world):
    from toondeck.deck.skills import sync_all

    _mk_skill(world["src"], "demo")
    sync_all()
    content = (world["views"] / ".roo" / "commands" / "demo.md").read_text(encoding="utf-8")
    assert content.startswith("---")  # roo keeps header (strip_frontmatter=False)
