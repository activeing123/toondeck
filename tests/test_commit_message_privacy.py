"""Commit messages are history too — and until 2026-09-05 no gate had ever read one.

The story: `git filter-repo` removed the internal planning documents from every
tree and every path in history, and the clean-room gate confirmed it. That work
was correct and still left a leak, because the commits that describe the
removal summarize what was removed. One message named the private directories,
listed the kinds of notes inside them, and spelled out the strategy those notes
carry — audience sequencing, the star-count base, the promotion dependency —
while explaining that publishing such material hands a roadmap to competitors.
The files were gone; the说明书 stayed.

So this gate reads prose, not trees. It is deliberately narrow: technical
narrative about the product is the useful part of a changelog and must survive.
What may not appear anywhere in history is where the author's machine lives,
what his private projects are called, and what the internal planning says.

Like the other privacy gates, the banned strings are assembled at runtime — a
gate that spells the words it hunts becomes the artifact that carries them.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def _w(*parts: str) -> str:
    return "".join(parts)


# name -> pattern. Kept to things that are never legitimate in a public
# changelog, so the gate stays cheap to satisfy and hard to argue with.
RULES: dict[str, re.Pattern] = {
    "author workspace path": re.compile(r"\b" + _w("open", "think") + r"\b", re.I),
    "private planning directory": re.compile(r"\.(context|spec)/"),
    "internal planning file": re.compile(_w("TASK", "_GRAPH"), re.I),
    "internal milestone file": re.compile(_w("MILESTONE", "-R") + r"|" + _w("PREREVIEW"), re.I),
    "private project name": re.compile(
        r"\b(" + "|".join([_w("cat", "paw"), _w("re", "hui")]) + r")\b", re.I
    ),
    "private skill name": re.compile(
        r"\b(" + "|".join([_w("g", "brain"), _w("ji", "yi"), _w("wig", "olo"),
                           _w("tui", "guang"), _w("xia", "zai"), _w("zhang", "ben"),
                           _w("mempal", "ace")]) + r")\b", re.I
    ),
    "internal strategy detail": re.compile(
        _w("192", "-star") + r"|audience" + r" sequencing|promotion" + r" dependency",
        re.I,
    ),
    # the machine's skill-farm size, not any number: a test fixture saying
    # "297-skill sandbox" is describing a fixture, which is ordinary changelog
    # material. Naming the author's own box and its size is not.
    "author machine inventory": re.compile(r"real machine's \d+-skill", re.I),
}


def scan(text: str) -> list[tuple[str, str]]:
    """Return (rule, matched text) for every leak in this blob of prose."""
    hits = []
    for name, rx in RULES.items():
        for m in rx.finditer(text):
            hits.append((name, m.group(0)))
    return hits


def _all_messages() -> list[tuple[str, str]]:
    # %x00 / %x01 are git's own escapes: passing a real NUL in argv is rejected
    # outright by CreateProcess on Windows.
    r = subprocess.run(
        ["git", "-C", str(REPO), "log", "--all", "--format=%h%x00%B%x01"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        return []
    out = []
    for chunk in r.stdout.split("\x01"):
        if not chunk.strip():
            continue
        sha, _, body = chunk.partition("\x00")
        out.append((sha.strip(), body))
    return out


def test_gate_is_not_vacuous():
    """A regex that matches nothing would pass forever; prove it can catch the
    exact sentences this repo had to rewrite."""
    samples = {
        "author workspace path": "tests used E:/" + _w("open", "think") + "/skills as a fixture",
        "private planning directory": "Untracking ." + "context/ and ." + "spec/ was not enough",
        "internal planning file": "live-fire evidence in " + _w("TASK", "_GRAPH"),
        "private project name": "why " + _w("cat", "paw") + "'s launch is disabled",
        "private skill name": "skills (" + _w("g", "brain") + "/" + _w("ji", "yi") + " & more)",
        "internal strategy detail": "the " + _w("192", "-star") + " developer base",
        "author machine inventory": "the real machine's 302-skill farm",
    }
    for rule, text in samples.items():
        names = [n for n, _ in scan(text)]
        assert rule in names, f"rule {rule!r} failed to catch its own example: {names}"


def test_no_private_planning_file_wording():
    """The narrow one: 'roadmap'/'competitors' alone are ordinary English, so
    check the phrasing that actually leaked rather than the words."""
    bad = [
        (sha, line)
        for sha, msg in _all_messages()
        for line in msg.splitlines()
        if re.search(r"hands? a roadmap to competitors|roadmap to competitors", line, re.I)
    ]
    assert not bad, f"strategy framing leaked into history:\n" + "\n".join(f"{s}: {l[:90]}" for s, l in bad[:5])


def test_commit_messages_carry_no_author_environment():
    """The main sweep: every message on every ref."""
    messages = _all_messages()
    if not messages:
        import pytest

        pytest.skip("no git history available (installed from sdist/wheel)")
    # guard against a silent empty scan, the failure mode that let this through
    assert len(messages) > 100, f"expected the full history, got {len(messages)} messages"

    offenders = []
    for sha, msg in messages:
        for rule, matched in scan(msg):
            line = next((ln for ln in msg.splitlines() if matched in ln), "")
            offenders.append(f"{sha}: {rule} «{matched}» — {line.strip()[:110]}")
    assert not offenders, (
        "commit messages are public on push; these leak the author's machine, "
        "private project names, or internal planning:\n" + "\n".join(offenders[:15])
    )


def test_the_sweep_actually_fails_on_a_leaky_history(monkeypatch):
    """Green proves nothing unless it can go red.

    Feed the sweep a synthetic history carrying the very sentence this repo had
    to rewrite — in memory, so no commit is made and no ref moves — and require
    it to blow up naming both the rule and the offender. Without this, a typo in
    a pattern would look exactly like a clean repository.
    """
    import sys

    import pytest

    fake = [(f"c{i:03d}", f"commit {i}: an honest technical note") for i in range(120)]
    fake[60] = (
        "deadbeef",
        "PRIVACY: internal notes go private\n\n"
        "they carry product strategy: audience sequencing, the " + _w("192", "-star") + " developer base\n",
    )
    monkeypatch.setattr(sys.modules[__name__], "_all_messages", lambda: fake)
    with pytest.raises(AssertionError) as caught:
        test_commit_messages_carry_no_author_environment()
    text = str(caught.value)
    assert "internal strategy detail" in text, f"failed for the wrong reason: {text[:200]}"
    assert "deadbeef" in text, "the failure must name the offending commit"
