"""deck.mcpdiscover internals — where MCP configs hide and how to read them."""

from __future__ import annotations

import json
import os
from pathlib import Path

# (source_label, kind, path pattern relative to $HOME; windows env-var rooted ones use env=)
SCHEDULED: list[dict] = [
    {"label": "claude-code", "kind": "json", "rel": ".claude.json"},
    {"label": "claude-desktop", "kind": "json", "env": "APPDATA", "rel": "Claude/claude_desktop_config.json"},
    {"label": "cursor", "kind": "json", "rel": ".cursor/mcp.json"},
    {"label": "windsurf", "kind": "json", "rel": ".codeium/windsurf/mcp_config.json"},
    {"label": "vscode", "kind": "json", "env": "APPDATA", "rel": "Code/User/mcp.json"},
    {"label": "codex", "kind": "toml", "rel": ".codex/config.toml"},
    {"label": "gemini-cli", "kind": "json", "rel": ".gemini/settings.json"},
]


def source_files(home: Path) -> list[tuple[str, str, Path]]:
    out: list[tuple[str, str, Path]] = []
    for spec in SCHEDULED:
        root = Path(os.environ[spec["env"]]) if spec.get("env") else home
        if spec.get("env") and spec["env"] not in os.environ:
            continue
        out.append((spec["label"], spec["kind"], root / spec["rel"]))
    return out


def read_json_mcp_servers(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    servers = data.get("mcpServers") if isinstance(data, dict) else None
    return servers if isinstance(servers, dict) else None


def read_toml_mcp_servers(path: Path) -> dict | None:
    try:
        import tomllib

        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError, UnicodeDecodeError):
        return None
    servers = data.get("mcp_servers") if isinstance(data, dict) else None
    return servers if isinstance(servers, dict) else None


def normalize(raw: dict) -> dict | None:
    """One raw server entry -> canonical shape; None if unrecognizable."""
    if not isinstance(raw, dict):
        return None
    if raw.get("url"):
        return {"transport": "http", "url": str(raw["url"])}
    if raw.get("command"):
        return {
            "transport": "stdio",
            "command": str(raw["command"]),
            "args": [str(a) for a in raw.get("args", [])] if isinstance(raw.get("args"), list) else [],
            "env": {str(k): str(v) for k, v in (raw.get("env") or {}).items()},
        }
    return None
