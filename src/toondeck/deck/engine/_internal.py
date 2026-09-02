"""deck.engine internals — mcptoon library bridge details. Not for cross-module import."""

from __future__ import annotations

import json
import time

import mcptoon.cache as mcache
import mcptoon.health as mhealth
import mcptoon.manifest as mmanifest
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


def check_all(**kwargs) -> list[dict]:
    return mhealth.check_all(**kwargs)


def get_manifest(use_cache: bool = True) -> dict[str, list[dict]]:
    return mmanifest.get_manifest(use_cache=use_cache)


def cache_meta(name: str) -> tuple[int, float | None]:
    """(cached tool count, cache age in seconds or None). No live probing."""
    import mcptoon.cache as cache_mod

    cache = cache_mod._load_cache()
    entry = cache.get(name)
    if not entry:
        return 0, None
    return len(entry.get("tools", [])), round(time.time() - entry.get("ts", 0), 1)


def token_savings() -> dict:
    """mcptoon's honest math on the CURRENT cache: full JSON vs SLIM manifest.

    len//4 estimation — no tiktoken claim. Pure-cache by design: this view
    NEVER triggers live probing (get_manifest would fetch on cache miss).
    Empty cache → zeroed, honest numbers.
    """
    cache = mcache._load_cache()
    manifest: dict[str, list[dict]] = {}
    for name, entry in cache.items():
        tools = [t for t in entry.get("tools", []) if isinstance(t, dict) and "name" in t]
        if tools:
            manifest[name] = tools

    def count_tokens(s: str) -> int:
        return len(s) // 4

    names = sorted(manifest)
    if names:
        full_json = json.dumps(
            {n: manifest[n] for n in names}, ensure_ascii=False, default=str
        )
        slim = ";".join(f"{n}:{','.join(sorted(t['name'] for t in manifest[n]))}" for n in names)
    else:
        full_json, slim = "", ""
    full_tokens, slim_tokens = count_tokens(full_json), count_tokens(slim)
    tool_total = sum(len(v) for v in manifest.values())
    saved = round((1 - slim_tokens / max(full_tokens, 1)) * 100) if full_tokens else 0
    return {
        "method": "len//4",
        "tool_total": tool_total,
        "full_json_tokens": full_tokens,
        "slim_tokens": slim_tokens,
        "saved_pct": max(saved, 0),
    }
