"""UX-017 (R39) RED→GREEN: single-skill sync — scoped reconciliation.

sync_one(name) re-derives ONE skill to every agent view. Scoped mode is
narrow, not whole: it must not heal unrelated skills (that is sync_all's
job) and must never delete stale files belonging to other skills —
narrow writes only.
"""

import pytest


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_SKILLS_DIR", str(tmp_path / "skills"))
    monkeypatch.setenv("TOONDECK_VIEWS_DIR", str(tmp_path / "views"))
    return tmp_path


def _mk_skill(root, name):
    d = root / "skills" / name
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: Skill {name}\n---\n\n# {name}\n", encoding="utf-8"
    )
    return d


def test_sync_one_links_one_skill_into_all_views(world):
    from toondeck.deck.skills import sync_one

    _mk_skill(world, "alpha")
    results = sync_one("alpha")["results"]
    assert len(results) == 6
    assert all(r["ok"] for r in results)
    views = world / "views"
    assert (views / ".claude" / "skills" / "alpha").is_dir()
    assert (views / ".codex" / "skills" / "alpha").is_dir()
    assert (views / ".roo" / "commands" / "alpha.md").is_file()
    assert (views / ".config" / "opencode" / "commands" / "alpha.md").is_file()


def test_sync_one_does_not_touch_other_skills(world):
    from toondeck.deck.skills import sync_one

    _mk_skill(world, "alpha")
    _mk_skill(world, "beta")
    views = world / "views"
    commands = views / ".roo" / "commands"
    commands.mkdir(parents=True)
    beta_md = commands / "beta.md"
    beta_md.write_text(
        "---\nname: beta\ndescription: Skill beta\n---\n", encoding="utf-8"
    )
    sync_one("alpha")
    assert beta_md.is_file(), "scoped sync must not delete other skills' derived files"


def test_sync_one_updates_drifted_copy_of_its_own_skill(world):
    from toondeck.deck.skills import sync_all, sync_one

    _mk_skill(world, "alpha")
    sync_all()
    md = world / "skills" / "alpha" / "SKILL.md"
    md.write_text(
        "---\nname: alpha\ndescription: Skill alpha v2\n---\n\n# alpha v2\n", encoding="utf-8"
    )
    results = sync_one("alpha")["results"]
    assert all(r["ok"] for r in results)
    out = (world / "views" / ".roo" / "commands" / "alpha.md").read_text(encoding="utf-8")
    assert "alpha v2" in out


def test_sync_one_unknown_skill_is_clean_error(world):
    from toondeck.deck.skills import sync_one

    r = sync_one("ghost")
    assert r["ok"] is False
    assert "not found" in r["error"].lower()


def test_sync_one_refuses_non_canon_names(world):
    from toondeck.deck.skills import sync_one

    for name in (".git", "__pycache__", "node_modules", "_index", ".DS_Store"):
        r = sync_one(name)
        assert r["ok"] is False
        assert "refusing" in r["error"].lower()


def test_sync_one_api_route(engine_env):
    from fastapi.testclient import TestClient
    from toondeck.deck.api.app import create_app

    d = engine_env / "skills" / "solo"
    d.mkdir(parents=True)
    (d / "SKILL.md").write_text("---\nname: solo\ndescription: S\n---\n", encoding="utf-8")
    r = TestClient(create_app()).post("/api/skills/sync/solo")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert len(body["results"]) == 6


def test_get_state_and_doctor_agree_with_engine_on_non_canon_dirs(world):
    """Live-fire R39 finding: _index (SKIP_SOURCE infra dir) with valid
    frontmatter used to be listed as a valid skill — its card rendered
    sync/remove buttons the engine always refuses. State and doctor must
    share the engine's canon definition."""
    from toondeck.deck.skills import doctor, get_state

    _mk_skill(world, "alpha")
    infra = world / "skills" / "_index"
    infra.mkdir()
    (infra / "SKILL.md").write_text(
        "---\nname: _index\ndescription: infra\n---\n", encoding="utf-8"
    )

    st = get_state()
    names = [s["dirname"] for s in st["skills"]]
    assert "alpha" in names
    assert "_index" not in names, "infra dirs are not skills"
    assert st["counts"]["total"] == 1

    rep = doctor()
    assert rep["source"]["total"] == 1
    assert "_index" not in rep["source"]["invalid"]
