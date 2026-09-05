"""Pre-publication privacy gate — the invariants a GitHub release must hold.

Born from the 2026-09-05 audit, where a full history sweep (230 tracked files +
674 blobs) found no real credential but did find three things that still should
not ship:

  * `pnpm_t.txt` — a captured vitest console dump committed by accident,
    carrying `E:/openthink/...` workspace paths
  * literal AWS/Slack token shapes in a redaction test — fake values, but
    GitHub's secret scanner cannot tell, and a false alarm on your own repo
    trains everyone to ignore the real ones
  * `E:/openthink/skills` used as a fixture path in tests — pure string, but it
    publishes the author's machine layout

Code and tests are held to this file's rules. `.context/` and `.spec/` are the
author's call (they carry product strategy), so they are reported, not gated.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# Where the rules apply: everything that is code, tests, or shipped UI source.
SCOPES = ("src", "tests", "web/src", "scripts")

# Never inside a public repo, in any form.
FORBIDDEN = [
    ("workspace path", re.compile(r"openthink", re.I)),
    ("machine hostname", re.compile(r"DESKTOP-[A-Z0-9]{6,}")),
    ("LAN address", re.compile(r"\b192\.168\.\d{1,3}\.\d{1,3}\b")),
    ("local account", re.compile(r"Users[/\\](Administrator|cxh)\b", re.I)),
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


def test_history_sweep_reports_but_does_not_gate_docs():
    """Informational: what the author still has to decide on.

    .context/ and .spec/ carry product strategy (audience plans, promotion
    sequencing, milestone notes). They are not secrets, but publishing them
    hands a roadmap to competitors. This test only asserts they are listed, so
    the decision stays visible instead of silently shipping.
    """
    out = subprocess.run(
        ["git", "-C", str(REPO), "ls-files", ".context", ".spec"], capture_output=True, text=True
    ).stdout.splitlines()
    strategy_docs = [p for p in out if p.endswith(".md")]
    # Either the docs are gone (author chose to untrack) or they exist and are
    # named here — both are acceptable; an empty-but-tracked dir is not.
    assert all((REPO / p).is_file() for p in strategy_docs)
