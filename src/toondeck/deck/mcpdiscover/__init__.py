"""deck.mcpdiscover — scan every known agent's MCP config, dedup, import into mcptoon.

Sources (data-driven, SCHEDULED in internal/): claude-code, claude-desktop,
cursor, windsurf, vscode, codex (TOML), gemini-cli. Generic mcpServers
fingerprinting lands in T-065 on top of this scanner.
"""

from __future__ import annotations

from pathlib import Path

from . import internal


def scan(home: Path | None = None) -> dict:
    """Return {'candidates': [...], 'sources_scanned': N}.

    Candidate: {name, transport, command?, args?, env?, url?, sources: [labels]}.
    Same name+same signature across agents merges into one candidate; the same
    name with a different signature is reported as a conflict suffix.
    """
    home = home or Path.home()
    candidates: dict[tuple, dict] = {}
    scanned = 0
    for label, kind, path in internal.source_files(home):
        scanned += 1
        if not path.is_file():
            continue
        servers = (
            internal.read_json_mcp_servers(path)
            if kind == "json"
            else internal.read_toml_mcp_servers(path)
        )
        if not servers:
            continue
        for name, raw in servers.items():
            norm = internal.normalize(raw)
            if norm is None:
                continue
            key = (
                name,
                norm.get("command"),
                tuple(norm.get("args", [])),
                norm.get("url"),
            )
            if key in candidates:
                if label not in candidates[key]["sources"]:
                    candidates[key]["sources"].append(label)
            elif name in {c["name"] for c in candidates.values()}:
                # same name, different signature — keep both, disambiguated
                norm["name"] = f"{name} ({label})"
                norm["sources"] = [label]
                candidates[(norm["name"],) + key[1:]] = norm
            else:
                norm["name"] = name
                norm["sources"] = [label]
                candidates[key] = norm
    return {
        "candidates": list(candidates.values()),
        "sources_scanned": scanned,
        "total": len(candidates),
    }


def import_names(candidates: list[dict], names: list[str]) -> dict:
    """Import selected candidates into mcptoon config via its public add_server."""
    from mcptoon import config as mcptoon_config

    existing = set(mcptoon_config.list_servers())
    by_name = {c["name"]: c for c in candidates}
    imported: list[str] = []
    skipped: list[str] = []
    for name in names:
        if name in existing:
            skipped.append(name)
            continue
        cand = by_name.get(name)
        if cand is None:
            skipped.append(name)
            continue
        if cand["transport"] == "stdio":
            cfg = {"command": cand["command"], "args": cand.get("args", [])}
            if cand.get("env"):
                cfg["env"] = cand["env"]
        else:
            cfg = {"url": cand["url"]}
        mcptoon_config.add_server(name, cfg)
        imported.append(name)
    return {"ok": True, "imported": len(imported), "skipped": len(skipped),
            "names": imported}


def discover() -> dict:
    return scan()


def import_selected(names: list[str]) -> dict:
    return import_names(scan()["candidates"], names)
