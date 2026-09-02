"""deck.engine internals — mcptoon library bridge details. Not for cross-module import."""

from __future__ import annotations

import mcptoon.sync as msync


def target_of(cfg: dict) -> str:
    """Human-readable connection target: URL for http, command line for stdio."""
    transport = cfg.get("transport", "stdio")
    if transport == "http":
        return str(cfg.get("url", ""))
    command = cfg.get("command", [])
    args = cfg.get("args", [])
    cmd = command if isinstance(command, list) else [command]
    return " ".join([*cmd, *args])


def key_names(mapping: dict | None) -> list[str]:
    """Expose key NAMES only — values are secrets and must never leave the vault."""
    return sorted((mapping or {}).keys())


def sync_to_all(**kwargs) -> list[dict]:
    return msync.sync_to_all(**kwargs)
