"""T-020 RED→GREEN: skills source model — scan + frontmatter parse (stdlib only)."""

import json

import pytest


@pytest.fixture
def source_env(tmp_path, monkeypatch):
    src = tmp_path / "skills"
    src.mkdir()
    monkeypatch.setenv("TOONDECK_SKILLS_DIR", str(src))
    return src


def _skill(src, name, body, *, frontmatter=True):
    d = src / name
    d.mkdir()
    if frontmatter:
        (d / "SKILL.md").write_text(body, encoding="utf-8")
    return d


GOOD = '---\nname: good-skill\ndescription: "A valid skill."\n---\n\n# Body\n'

GOOD_UNQUOTED = "---\nname: unquoted-skill\ndescription: Plain description here\n---\n\nBody\n"

NO_FRONTMATTER = "# Just a readme, no yaml block\n"


def test_frontmatter_parses_name_and_description(tmp_path):
    from toondeck.deck.skills.internal import frontmatter

    meta, errors = frontmatter.parse(GOOD)
    assert meta["name"] == "good-skill"
    assert meta["description"] == "A valid skill."
    assert errors == []


def test_frontmatter_accepts_unquoted_values(tmp_path):
    from toondeck.deck.skills.internal import frontmatter

    meta, errors = frontmatter.parse(GOOD_UNQUOTED)
    assert meta["name"] == "unquoted-skill"
    assert meta["description"] == "Plain description here"
    assert errors == []


def test_frontmatter_missing_block_is_invalid():
    from toondeck.deck.skills.internal import frontmatter

    meta, errors = frontmatter.parse(NO_FRONTMATTER)
    assert meta == {}
    assert any("frontmatter" in e.lower() for e in errors)


def test_frontmatter_missing_description_is_reported():
    from toondeck.deck.skills.internal import frontmatter

    meta, errors = frontmatter.parse("---\nname: x\n---\n\nBody\n")
    assert meta.get("name") == "x"
    assert any("description" in e.lower() for e in errors)


def test_frontmatter_folded_scalar_joins_lines():
    """Real-world: description: >- with indented continuation lines (insforge style)."""
    from toondeck.deck.skills.internal import frontmatter

    text = (
        "---\nname: insforge\ndescription: >-\n  Use this skill when writing app code.\n"
        "  Trigger on requests like add auth.\nlicense: Apache-2.0\n---\n\n# Body\n"
    )
    meta, errors = frontmatter.parse(text)
    assert errors == []
    assert meta["name"] == "insforge"
    assert meta["description"] == "Use this skill when writing app code. Trigger on requests like add auth."


def test_frontmatter_nested_blocks_are_not_errors():
    """A `metadata:` block with indented sub-keys must not fail lint.

    The shape is common in the wild. The name and author here are neutral
    fakes: a fixture that cites somebody's real project breaks the day they
    rename it, and it advertises a third party's handle in our test suite.
    """
    from toondeck.deck.skills.internal import frontmatter

    text = (
        "---\nname: diagrammer\ndescription: Diagrams as explorable standalone HTML.\n"
        "license: MIT\nmetadata:\n  version: \"2.16\"\n  author: example\n---\n\n# Body\n"
    )
    meta, errors = frontmatter.parse(text)
    assert errors == [], errors
    assert meta["name"] == "diagrammer"
    assert meta["license"] == "MIT"


def test_frontmatter_literal_scalar_preserves_newlines():
    from toondeck.deck.skills.internal import frontmatter

    text = "---\nname: lit\ndescription: |\n  line one\n  line two\n---\n\nBody\n"
    meta, errors = frontmatter.parse(text)
    assert errors == []
    assert meta["description"] == "line one\nline two"


def test_get_state_lists_all_skill_dirs_with_validity(source_env):
    from toondeck.deck.skills import get_state

    _skill(source_env, "good-skill", GOOD)
    _skill(source_env, "broken", NO_FRONTMATTER)
    _skill(source_env, "no-md", "", frontmatter=False)
    (source_env / "a-loose-file.txt").write_text("not a skill", encoding="utf-8")

    state = get_state()
    assert state["source"] == str(source_env)
    by_dir = {s["dirname"]: s for s in state["skills"]}
    assert set(by_dir) == {"good-skill", "broken", "no-md"}
    assert by_dir["good-skill"]["valid"] is True
    assert by_dir["good-skill"]["name"] == "good-skill"
    assert by_dir["broken"]["valid"] is False
    assert by_dir["no-md"]["valid"] is False  # no SKILL.md at all
    assert state["counts"]["total"] == 3
    assert state["counts"]["valid"] == 1


def test_get_state_survives_missing_source(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_SKILLS_DIR", str(tmp_path / "void"))
    from toondeck.deck.skills import get_state

    state = get_state()
    assert state["skills"] == []
    assert state["exists"] is False


def test_state_never_contains_skill_file_bodies(source_env):
    """Lean-state guarantee: bodies stay on disk; the deck ships metadata only."""
    from toondeck.deck.skills import get_state

    _skill(source_env, "good-skill", GOOD + "SECRET-LOOKING-BODY")
    blob = json.dumps(get_state())
    assert "SECRET-LOOKING-BODY" not in blob


def test_get_state_collapses_home_to_tilde(tmp_path, monkeypatch):
    """R44: source_display is the human form of source — a home-prefixed
    path collapses to ~. The raw absolute path stays verbatim in `source`
    (additive key, nothing removed)."""
    import pathlib
    from toondeck.deck.skills import get_state

    fake_home = tmp_path / "home"
    src = fake_home / ".toondeck" / "skills"
    src.mkdir(parents=True)
    monkeypatch.setenv("TOONDECK_SKILLS_DIR", str(src))
    monkeypatch.setattr(pathlib.Path, "home", classmethod(lambda cls: fake_home))

    st = get_state()
    assert st["source"] == str(src), "raw path must be preserved verbatim"
    assert st["source_display"] == "~" + str(src)[len(str(fake_home)):], (
        "home prefix must collapse to ~"
    )


def test_get_state_source_display_passthrough_non_home(tmp_path, monkeypatch):
    """A source OUTSIDE the home dir passes through unchanged. tmp_path is
    NOT usable here — on Windows it literally lives under the real home
    (C:\\Users\\<user>\\AppData\\...) so a fake drive root is the honest
    non-home fixture."""
    from toondeck.deck.skills import get_state

    monkeypatch.setenv("TOONDECK_SKILLS_DIR", "Q:\\elsewhere\\skills")
    st = get_state()
    assert st["source"] == "Q:\\elsewhere\\skills"
    assert st["source_display"] == "Q:\\elsewhere\\skills"
