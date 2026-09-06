"""Pre-publication privacy gate — the invariants a GitHub release must hold.

Born from the 2026-09-05 audit, where a full history sweep (230 tracked files +
674 blobs) found no real credential but did find three things that still should
not ship:

  * `pnpm_t.txt` — a captured vitest console dump committed by accident,
    carrying the author's absolute workspace paths
  * literal AWS/Slack token shapes in a redaction test — fake values, but
    GitHub's secret scanner cannot tell, and a false alarm on your own repo
    trains everyone to ignore the real ones
  * a real workspace path used as a test fixture — pure string, but it
    publishes the author's machine layout

Code and tests are held to this file's rules. `.context/` and `.spec/` carry
product strategy and are untracked by the author's decision — that decision is
itself gated below, because an untracked directory is one `git add -A` away from
being public again.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# Where the rules apply: everything that is code, tests, or shipped UI source.
SCOPES = ("src", "tests", "web/src", "scripts")

# Never inside a public repo, in any form.
# The sensitive literals below are assembled at runtime for the same reason the
# token shapes are: this file is itself in scope, so writing the words out would
# trip the gate it defines (and publish them). Consistency over cuteness.
_WS = "open" + "think"  # the author's workspace folder name
_ACCT = "Admin" + "istrator"
_ACCT2 = "c" + "xh"  # a second machine's account name
FORBIDDEN = [
    ("workspace path", re.compile(_WS, re.I)),
    ("machine hostname", re.compile(r"DESKTOP-[A-Z0-9]{6,}")),
    ("LAN address", re.compile(r"\b192\.168\.\d{1,3}\.\d{1,3}\b")),
    ("local account", re.compile(rf"Users[/\\]({_ACCT}|{_ACCT2})\b", re.I)),
    # Token shapes a scanner will flag. Build them at runtime if a test needs
    # them (see tests/test_agents_logs_ws.py) so nothing matchable sits at rest.
    ("AWS key shape", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token shape", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
    ("Slack token shape", re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b")),
    ("Google API shape", re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}")),
    ("private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]

# Built/minified assets: not hand-written, and full of words like "password".
SKIP_SUFFIXES = (".js", ".css", ".map")
SKIP_PARTS = ("webui", "__pycache__", ".egg-info")


def tracked_code_files() -> list[Path]:
    out = subprocess.run(
        ["git", "-C", str(REPO), "ls-files", *SCOPES], capture_output=True, text=True
    ).stdout.splitlines()
    files = []
    for rel in out:
        p = REPO / rel
        if not p.is_file() or p.suffix in SKIP_SUFFIXES:
            continue
        if any(part in p.parts for part in SKIP_PARTS):
            continue
        files.append(p)
    return files


def test_no_private_identifiers_in_shipped_code():
    offenders = []
    for f in tracked_code_files():
        text = f.read_text(encoding="utf-8", errors="replace")
        for i, line in enumerate(text.splitlines(), 1):
            for label, pat in FORBIDDEN:
                if pat.search(line):
                    rel = f.relative_to(REPO).as_posix()
                    offenders.append(f"{rel}:{i} [{label}]")
    assert not offenders, "private identifiers would go public:\n" + "\n".join(offenders[:20])


def test_no_stray_capture_files_at_repo_root():
    """Console dumps committed by accident (the `pnpm_t.txt` class of bug)."""
    suspects = []
    for p in REPO.iterdir():
        if not p.is_file():
            continue
        name = p.name.lower()
        if name.endswith((".txt", ".log", ".out", ".bak", ".orig", ".cred")):
            suspects.append(p.name)
    assert not suspects, f"stray capture files at repo root: {suspects}"


def test_scanned_file_count_is_sane():
    """Guard against the gate silently scanning nothing."""
    files = tracked_code_files()
    assert len(files) > 100, f"only {len(files)} files scanned — scope is broken"


def test_internal_planning_docs_stay_untracked():
    """The author's decision (2026-09-05): `.context/` and `.spec/` are private
    working memory — audience plans, promotion sequencing, milestone notes.
    They are not credentials, but publishing them hands a roadmap to
    competitors. They stay on disk and out of the repo; this test is what stops
    a future `git add -A` from quietly putting them back."""
    out = subprocess.run(
        ["git", "-C", str(REPO), "ls-files", ".context", ".spec"], capture_output=True, text=True
    ).stdout.splitlines()
    assert out == [], f"internal planning docs are tracked again: {out}"
    ignored = subprocess.run(
        ["git", "-C", str(REPO), "check-ignore", "-q", ".context/DECISIONS.md"], capture_output=True
    ).returncode
    assert ignored == 0, ".context/ must be gitignored, not just deleted from the index"


# ── author-environment traces ─────────────────────────────────────────────
# N2/N4 (2026-09-05): neither the credential sweep nor the clean-room gate can
# see these. They are not secrets and they do not break an install — they are
# one developer's own skill names riding along in a public product: pinyin a
# stranger cannot decode, and private tool names he does not have. Shipping
# them publishes one person's stack, and a classifier built from them silently
# sorts every other user's skills into 其他.
# Assembled from halves, same rule as _WS above: this file is in scope.
# Deliberately NOT here: `dsh` (ToonDeck formally supports it as an agent — see
# deck/agents/adapters/, so it is a product feature, not a leak) and `archify`
# (a public third-party project some fixtures happened to cite; the fixtures
# have since been renamed to neutral fakes anyway).
_TRACES = tuple(
    a + b
    for a, b in (
        ("g", "brain"), ("mempal", "ace"), ("ji", "yi"), ("zhang", "ben"),
        ("hui", "hua"), ("xia", "zai"), ("kua", "ke"),
        ("tu", "pu"), ("lun", "xun"), ("stream", "guard"), ("dual", "-machine"),
        ("yu", "ming"), ("tui", "guang"), ("she", "jiao"), ("mail", "bot"),
        ("ri", "bao"), ("xie", "wen"), ("zcl", "ean"),
        ("qing", "li"), ("ka", "mi"), ("wig", "olo"), ("om", "ni"), ("last", "30"),
    )
)
_TRACE_RE = re.compile(r"\b(" + "|".join(_TRACES) + r")\b", re.I)


def test_no_author_environment_traces_in_shipped_code():
    """A product meant for strangers must not name one stranger's tools."""
    offenders = []
    for f in tracked_code_files():
        text = f.read_text(encoding="utf-8", errors="replace")
        for i, line in enumerate(text.splitlines(), 1):
            m = _TRACE_RE.search(line)
            if m:
                offenders.append(f"{f.relative_to(REPO).as_posix()}:{i} [{m.group(1)}]")
    assert not offenders, (
        "author-environment names would ship to strangers:\n" + "\n".join(offenders[:20])
    )
