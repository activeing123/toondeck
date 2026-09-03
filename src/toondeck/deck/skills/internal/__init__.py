"""deck.skills internals — sync engine details. Not for cross-module import."""

from __future__ import annotations

import json
import os
from pathlib import Path

CONFIG_NAME = "config.json"


def hub_home() -> Path:
    """The hub's own home for ledgers/graveyard/config (~/.toondeck or TOONDECK_HOME)."""
    env = os.environ.get("TOONDECK_HOME")
    if env:
        return Path(env)
    return Path.home() / ".toondeck"


def _configured_source() -> Path | None:
    """skills_source from ~/.toondeck/config.json — how the hub adopts a
    pre-existing skills farm without touching it (coexistence law)."""
    cfg = hub_home() / CONFIG_NAME
    try:
        data = json.loads(cfg.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    raw = data.get("skills_source")
    if not isinstance(raw, str) or not raw.strip():
        return None
    return Path(os.path.expanduser(raw.strip()))


def source_dir() -> Path:
    """The single source of truth for skills, resolved by precedence:
    env TOONDECK_SKILLS_DIR (tests/sandbox) > config.json skills_source
    > default ~/.toondeck/skills."""
    env = os.environ.get("TOONDECK_SKILLS_DIR")
    if env:
        return Path(env)
    configured = _configured_source()
    if configured:
        return configured
    return hub_home() / "skills"


def source_root() -> Path:
    """Config root for ledger/tombstone state — ALWAYS the hub home, even when
    the source itself lives elsewhere (the hub's home is the hub's)."""
    return hub_home()
