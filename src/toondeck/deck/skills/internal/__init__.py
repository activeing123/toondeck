"""deck.skills internals — sync engine details. Not for cross-module import."""

from __future__ import annotations

import os
from pathlib import Path


def source_dir() -> Path:
    """The single source of truth for skills. Env override; default ~/.toondeck/skills."""
    env = os.environ.get("TOONDECK_SKILLS_DIR")
    if env:
        return Path(env)
    return Path.home() / ".toondeck" / "skills"


def source_root() -> Path:
    """Config root for ledger/tombstone state (~/.toondeck or env-derived parent)."""
    env = os.environ.get("TOONDECK_SKILLS_DIR")
    if env:
        return Path(env).parent
    return Path.home() / ".toondeck"
