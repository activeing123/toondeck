"""T-030 RED→GREEN: agent adapter protocol — 7 first-class JSON adapters + detect."""

import json

import pytest

FIRST_CLASS = {"claude-code", "codex", "cursor", "gemini-cli", "opencode", "catpaw", "dsh", "omp"}


def test_all_first_class_adapters_load_and_validate():
    from toondeck.deck.agents import internal as registry

    adapters = registry.load_all()
    assert set(adapters) == FIRST_CLASS
    for aid, a in adapters.items():
        assert a["id"] == aid
        assert isinstance(a["display_name"], str) and a["display_name"]
        assert isinstance(a["executable_probes"], list)
        assert isinstance(a["config_paths"], list)
        assert isinstance(a["launch_command"], list) or a["launch_command"] is None
        assert isinstance(a["env_config_support"], bool)


def test_schema_rejects_broken_adapter(tmp_path):
    from toondeck.deck.agents import internal as registry

    bad = tmp_path / "broken.json"
    bad.write_text(json.dumps({"id": "broken", "display_name": "x", "launch_command": []}))
    with pytest.raises(ValueError, match="launch_command"):
        registry.load_one(bad)


def test_detect_reports_evidence_hermetically(tmp_path, monkeypatch):
    """Dir/file probes expand ~ into the test home; executable probes scan PATH."""
    from toondeck.deck.agents import internal as registry
    from toondeck.deck.agents.internal import probes

    home = tmp_path / "home"
    (home / ".claude").mkdir(parents=True)
    (home / ".claude.json").write_text("{}", encoding="utf-8")
    monkeypatch.setenv("USERPROFILE", str(home))
    monkeypatch.setenv("HOME", str(home))

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    (fake_bin / "cla.cmd").write_text("@echo ok\r\n", encoding="utf-8")
    monkeypatch.setenv("PATH", f"{fake_bin};{fake_bin.as_posix()}")

    adapters = registry.load_all()
    r = probes.detect(adapters["claude-code"], home=home)
    assert r["installed"] is True
    assert r["evidence"]["dir:~/.claude"] is True
    assert r["evidence"]["exe:cla"] is True
    assert r["config_paths"]["~/.claude.json"] is True


def test_detect_uninstalled_agent_is_honest(tmp_path, monkeypatch):
    from toondeck.deck.agents import internal as registry
    from toondeck.deck.agents.internal import probes

    home = tmp_path / "empty-home"
    home.mkdir()
    monkeypatch.setenv("USERPROFILE", str(home))
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("PATH", str(tmp_path))  # nothing on PATH

    adapters = registry.load_all()
    r = probes.detect(adapters["gemini-cli"], home=home)
    assert r["installed"] is False
    assert all(v is False for v in r["evidence"].values())
