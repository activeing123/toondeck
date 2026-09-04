"""agentdiscover internals — fingerprint rules for mcp-bearing config dirs."""

from __future__ import annotations

import json
import os
from pathlib import Path

SIGNATURE_JSON = Path(__file__).resolve().parent / "signature.json"

#: config filenames that may carry MCP server maps
MCP_FILENAMES = {"mcp.json", "mcp_config.json", "claude.json", "settings.json", "config.json", "config.toml"}
#: N-R1: yaml configs count too — oh-my-pi keeps its agent settings in
#: config.yml, and a yml-blind scan misses every one of those users
MCP_SUFFIXES = {".json", ".toml", ".yaml", ".yml"}
MCP_KEYS = ("mcpServers", "mcp_servers", "mcp")
SCAN_CAP = 500


def load_signature_db() -> list[dict]:
    data = json.loads(SIGNATURE_JSON.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return list(data.values())
    return data


def scan_roots(home: Path) -> list[Path]:
    """$HOME dot-dirs (depth 1) + their children (depth 2) + APPDATA dirs."""
    roots: list[Path] = []
    try:
        for entry in home.iterdir():
            if entry.is_dir() and (entry.name.startswith(".") or entry.name in ("AppData", "config")):
                roots.append(entry)
                try:
                    for child in entry.iterdir():
                        if child.is_dir():
                            roots.append(child)
                except OSError:
                    pass
    except OSError:
        pass
    appdata = os.environ.get("APPDATA")
    if appdata:
        try:
            for entry in Path(appdata).iterdir():
                if entry.is_dir():
                    roots.append(entry)
        except OSError:
            pass
    return roots


def looks_like_mcp(path: Path) -> bool:
    try:
        if path.stat().st_size > 2_000_000:
            return False
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return any(k in text for k in MCP_KEYS)
