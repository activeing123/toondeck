"""Agent view registry — where every agent expects to see the skills source.

Paths resolve under TOONDECK_VIEWS_DIR (sandbox/test) or the real home dir.
Ported from tongbu-skills v7: three whole-dir link views, one per-skill farm,
two flat derivative views. Project-level injection is Phase 2.
"""

from __future__ import annotations

import os
from pathlib import Path

WHOLE = ("claude-code", "agents", "catpaw")
FARM = ("codex",)
FLAT = ("roo", "opencode")

REL = {
    "claude-code": ".claude/skills",
    "agents": ".agents/skills",
    "catpaw": ".catpaw/skills",
    "codex": ".codex/skills",
    "roo": ".roo/commands",
    "opencode": ".config/opencode/commands",
}

# local dirs that coexist inside a farm without belonging to the source
KEEP_LOCAL = {".system"}

ALL = list(REL)


def views_root() -> Path:
    env = os.environ.get("TOONDECK_VIEWS_DIR")
    return Path(env) if env else Path.home()


def view_path(agent: str) -> Path:
    return views_root() / REL[agent]
