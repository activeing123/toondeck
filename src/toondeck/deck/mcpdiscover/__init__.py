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


def attributions(home: Path | None = None) -> dict[str, list[str]]:
    """Configured server name -> agent-config sources that define it.

    Matches by name across all scheduled sources. Servers not found in any
    agent config are attributed to "toondeck" (added here first).
    """
    home = home or Path.home()

    from .internal import read_json_mcp_servers, read_toml_mcp_servers, source_files

    out: dict[str, list[str]] = {}
    for label, kind, path in source_files(home):
        servers = (
            read_toml_mcp_servers(path) if kind == "toml" else read_json_mcp_servers(path)
        )
        if not servers:
            continue
        for name in servers:
            out.setdefault(name, []).append(label)
    return out


def list_tools(timeout: float = 6.0) -> dict:
    """Per-server tool listings via mcptoon MCPClient (mcpcompat shim applies).

    Unlike mcptoon.health (counts only), this keeps names + descriptions so
    the GUI can show what each server actually offers.
    """
    import time as _time

    from mcptoon import config as mcptoon_config
    from mcptoon.client import MCPClient, MCPError

    servers = []
    for name in sorted(mcptoon_config.list_servers()):
        cfg = mcptoon_config.get_server_config(name)
        entry: dict = {"server": name, "tools": [], "error": None}
        if not cfg:
            entry["status"] = "no-config"
            servers.append(entry)
            continue
        start = _time.time()
        try:
            if cfg.get("transport", "stdio") == "http":
                client_cm = MCPClient(http_url=cfg.get("url", ""),
                                      headers=cfg.get("headers", {}), timeout=timeout,
                                      spec="legacy")
            else:
                command = cfg.get("command", [])
                cmd_list = command if isinstance(command, list) else [command]
                client_cm = MCPClient(stdio=[*cmd_list, *cfg.get("args", [])],
                                      env=cfg.get("env", {}), timeout=timeout,
                                      spec="legacy")
            with client_cm as client:
                tools = client.list_tools() or []
            entry["status"] = "ok"
            entry["tools"] = [
                {"name": t.get("name", "?"),
                 "description": (t.get("description") or "")[:140]}
                for t in tools
                if isinstance(t, dict)
            ]
        except (MCPError, OSError, ValueError) as e:
            entry["status"] = "error"
            entry["error"] = str(e)[:200]
        entry["latency_ms"] = int((_time.time() - start) * 1000)
        servers.append(entry)
    return {"checked": len(servers), "servers": servers}


def import_selected(names: list[str]) -> dict:
    return import_names(scan()["candidates"], names)
