"""deck.journal — the deck's activity ledger (R45).

Why: pipe logs only exist for agents launched FROM the deck; desktop-window
agents never write pipes, so the Logs page was permanently empty for users
whose agents all launch in windows. The journal records what the DECK ITSELF
does — health checks, syncs, agent launch/stop, vault probes — as JSON lines
in TOONDECK_HOME/journal.jsonl. /api/activity reads it back.

Contract:
- record() NEVER raises: a journaling failure must never break the action
  it records (the action's own result is the truth; the journal is a mirror)
- read() NEVER raises and skips torn/corrupt lines (crash mid-write)
- file stays bounded: over the byte cap, the oldest half is dropped
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path

_LOCK = threading.Lock()

# bound: 256 KiB ≈ 1500-2000 events; on overflow keep the newest half
_MAX_BYTES = 256 * 1024


def journal_path() -> Path:
    """TOONDECK_HOME/journal.jsonl (same home convention as the skills hub)."""
    env = os.environ.get("TOONDECK_HOME")
    home = Path(env) if env else Path.home() / ".toondeck"
    return home / "journal.jsonl"


def _trim(p: Path) -> None:
    """Keep the newest half of the file (called under _LOCK)."""
    lines = p.read_text(encoding="utf-8").splitlines()
    keep = lines[len(lines) // 2 :]
    p.write_text("".join(line + "\n" for line in keep), encoding="utf-8")


def record(event: str, **fields) -> None:
    """Append one event line. Best-effort by contract — never raises."""
    entry = {
        "ts": datetime.now().astimezone().isoformat(timespec="seconds"),
        "event": event,
        **fields,
    }
    line = json.dumps(entry, ensure_ascii=False)
    with _LOCK:
        try:
            p = journal_path()
            p.parent.mkdir(parents=True, exist_ok=True)
            if p.is_file() and p.stat().st_size > _MAX_BYTES:
                _trim(p)
            with p.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass


def read(limit: int = 100) -> list[dict]:
    """Newest-first tail of the journal. Corrupt lines are skipped."""
    if limit < 1:
        return []
    try:
        p = journal_path()
        if not p.is_file():
            return []
        out: list[dict] = []
        with p.open("r", encoding="utf-8") as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    out.append(json.loads(raw))
                except ValueError:
                    continue  # torn tail line from a crash mid-write
        return list(reversed(out[-limit:]))
    except OSError:
        return []
