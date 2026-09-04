"""R45 RED→GREEN: deck.journal — the activity ledger behind the Logs page.

Pipe logs only exist for deck-launched agents; window-launched agents never
write pipes, so the Logs page was a lie for window-only users. The journal
records what the DECK itself does, and /api/activity reads it back.
"""

import json

import pytest


@pytest.fixture
def jhome(tmp_path, monkeypatch):
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path / "home"))
    return tmp_path / "home"


def test_record_appends_json_line(jhome):
    from toondeck.deck import journal

    journal.record("mcp.health", servers=6, ok=5)
    p = jhome / "journal.jsonl"
    assert p.is_file()
    entry = json.loads(p.read_text(encoding="utf-8").splitlines()[-1])
    assert entry["event"] == "mcp.health"
    assert entry["servers"] == 6
    assert "ts" in entry


def test_read_returns_newest_first(jhome):
    from toondeck.deck import journal

    for i in range(5):
        journal.record("t.tick", i=i)
    out = journal.read()
    assert [e["i"] for e in out] == [4, 3, 2, 1, 0]
    assert journal.read(limit=2)[0]["i"] == 4


def test_read_skips_torn_lines(jhome):
    """Crash mid-write leaves a half line — read() must skip, never raise."""
    from toondeck.deck import journal

    journal.record("t.good", n=1)
    p = jhome / "journal.jsonl"
    with p.open("a", encoding="utf-8") as f:
        f.write('{"ts": "torn", "event": "t.bad", "half_')  # no newline, no close
    out = journal.read()
    assert len(out) == 1
    assert out[0]["event"] == "t.good"


def test_record_never_raises(jhome, monkeypatch):
    """A journaling failure must never break the action it records."""
    from toondeck.deck import journal

    # point the home at a FILE — mkdir/open will fail with OSError
    blocker = jhome.parent / "blocker"
    blocker.write_text("not a dir", encoding="utf-8")
    monkeypatch.setenv("TOONDECK_HOME", str(blocker))
    journal.record("t.doomed")  # must not raise
    assert journal.read() == []


def test_journal_file_stays_bounded(jhome, monkeypatch):
    from toondeck.deck import journal

    monkeypatch.setattr(journal, "_MAX_BYTES", 2000)
    for i in range(60):
        journal.record("t.fill", i=i, pad="x" * 60)
    p = jhome / "journal.jsonl"
    assert p.stat().st_size < 4000  # cap + one entry of slack, not unbounded
    newest = journal.read(limit=1)[0]
    assert newest["i"] == 59, "trim keeps the newest events"


def test_record_is_thread_safe(jhome):
    """Concurrent recordings: every line lands intact (file-lock contract)."""
    from concurrent.futures import ThreadPoolExecutor

    from toondeck.deck import journal

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda i: journal.record("t.concurrent", i=i), range(80)))
    out = journal.read(limit=1000)
    assert len(out) == 80
    assert sorted(e["i"] for e in out) == list(range(80))
