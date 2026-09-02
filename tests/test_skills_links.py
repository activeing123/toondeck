"""T-021 RED→GREEN: cross-platform link layer — junction/symlink/copy chain.

The LESSON-approved dangling rule: never trust os.path.exists on links;
enumerate-and-stat. A dangling junction raises on os.stat — that IS the signal.
"""

import sys

import pytest

win_only = pytest.mark.skipif(sys.platform != "win32", reason="junctions are Windows-only")


def _with_source(tmp_path):
    src = tmp_path / "source"
    (src / "demo").mkdir(parents=True)
    (src / "demo" / "SKILL.md").write_text("---\nname: demo\ndescription: d\n---\n", encoding="utf-8")
    return src


def test_make_link_uses_junction_on_windows(tmp_path):
    from toondeck.deck.skills.internal import links

    src = _with_source(tmp_path)
    link = tmp_path / "views" / "skills"
    kind = links.make_link(link, src / "demo")
    if sys.platform == "win32":
        assert kind == "junction"
        assert links.link_kind(link) == "junction"
    else:
        assert kind == "symlink"
    # transparent read-through
    assert (link / "SKILL.md").is_file()
    # link does NOT duplicate content
    assert link.resolve() == (src / "demo").resolve()


def test_dangling_link_detected_by_stat_not_exists(tmp_path):
    from toondeck.deck.skills.internal import links

    src = _with_source(tmp_path)
    link = tmp_path / "dangling"
    links.make_link(link, src / "demo")
    # pull the target out from under the link
    import shutil

    shutil.rmtree(src / "demo")
    assert links.is_dangling(link) is True
    # os.path.exists would report False here — that is the trap this guards against
    assert links.link_kind(link) in ("junction", "symlink")


def test_healthy_link_not_dangling(tmp_path):
    from toondeck.deck.skills.internal import links

    src = _with_source(tmp_path)
    link = tmp_path / "healthy"
    links.make_link(link, src / "demo")
    assert links.is_dangling(link) is False


def test_real_directory_is_not_a_link(tmp_path):
    from toondeck.deck.skills.internal import links

    real = tmp_path / "real"
    real.mkdir()
    assert links.link_kind(real) == "dir"
    assert links.is_dangling(real) is False


def test_missing_path_reports_missing(tmp_path):
    from toondeck.deck.skills.internal import links

    assert links.link_kind(tmp_path / "nope") == "missing"


@win_only
def test_junction_target_readable(tmp_path):
    """Windows integration: junction created without admin rights, target resolvable."""
    from toondeck.deck.skills.internal import links

    src = _with_source(tmp_path)
    link = tmp_path / "j"
    kind = links.make_link(link, src / "demo")
    assert kind == "junction"
    assert links.read_target(link) == (src / "demo").resolve()


def test_remove_link_spares_target_content(tmp_path):
    from toondeck.deck.skills.internal import links

    src = _with_source(tmp_path)
    link = tmp_path / "v"
    links.make_link(link, src / "demo")
    links.remove_link(link)
    assert not link.exists()
    # the SOURCE content survives link removal — deletion only ever unlinks
    assert (src / "demo" / "SKILL.md").is_file()


def test_copy_fallback_fully_copies(tmp_path, monkeypatch):
    """Filesystems without link support degrade to copy+hash, still consistent."""
    from toondeck.deck.skills.internal import links

    src = _with_source(tmp_path)
    link = tmp_path / "copied"
    kind = links.make_link(link, src / "demo", force="copy")
    assert kind == "copy"
    assert (link / "SKILL.md").is_file()
    assert links.link_kind(link) == "dir"


def test_dir_fingerprint_changes_on_content_change(tmp_path):
    """Hash chain: fingerprint of a dir changes when any file inside changes."""
    from toondeck.deck.skills.internal import links

    src = _with_source(tmp_path)
    fp1 = links.dir_fingerprint(src / "demo")
    (src / "demo" / "extra.py").write_text("x = 1", encoding="utf-8")
    fp2 = links.dir_fingerprint(src / "demo")
    assert fp1 != fp2
    assert len(fp2) == 16  # stable short hex digest
