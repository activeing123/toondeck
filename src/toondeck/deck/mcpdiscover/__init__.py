"""deck.mcpdiscover — scan every known agent's MCP config, dedup, import into mcptoon.

Sources (data-driven, SCHEDULED in internal/): claude-code, claude-desktop,
cursor, windsurf, vscode, codex (TOML), gemini-cli. Generic mcpServers
fingerprinting lands in T-065 on top of this scanner.
"""

from __future__ import annotations

import time as _time
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
    if imported:
        _bust_inventory_cache()  # UI must never show stale numbers after an import
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
    the GUI can show what each server actually offers. Superseded by
    inventory() (T-070) which also covers discovered-but-unadopted servers.
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


# ── T-070: full local tool inventory — the honest "how many tools do I own" number ──
# ── UX-A2: parallel probing + hard deadlines + import busts the cache ──

_CACHE: dict = {"ts": 0.0, "data": None}
_CACHE_TTL = 120.0

# child processes of in-flight inventory probes, by server name — the joiner
# kills a timed-out probe's child so the blocked readline thread drains (EOF)
# instead of leaking until process exit (same mechanism as engine.check_all_legacy).
_ACTIVE_PROCS: dict[str, object] = {}


def _bust_inventory_cache() -> None:
    """Drop the 2-minute cache so the next inventory() re-probes live."""
    _CACHE["ts"] = 0.0
    _CACHE["data"] = None


def _probe_one(name: str, cfg: dict, timeout: float, results: dict, slots) -> None:
    """Legacy-handshake probe of one server; always writes a verdict.

    Daemon-thread body: every failure becomes a status, never an exception.
    Lifecycle managed manually so the child proc can be registered for the
    deadline kill right after initialize — the hang site is list_tools.
    A probe child slot is held for the whole probe (R17 fleet cap).
    """
    from mcptoon.client import MCPClient, MCPError

    if not slots.acquire(timeout):
        results.setdefault(name, {
            "server": name, "status": "timeout", "tools": [],
            "error": f"probe slot unavailable within {timeout}s (fleet cap)",
        })
        return
    start = _time.time()
    client: MCPClient | None = None
    try:
        if cfg.get("transport", "stdio") == "http":
            client = MCPClient(http_url=cfg.get("url", ""),
                               headers=cfg.get("headers", {}), timeout=timeout,
                               spec="legacy")
        else:
            command = cfg.get("command", [])
            cmd_list = command if isinstance(command, list) else [command]
            client = MCPClient(stdio=[*cmd_list, *cfg.get("args", [])],
                               env=cfg.get("env", {}), timeout=timeout,
                               spec="legacy")
        client.initialize()
        _ACTIVE_PROCS[name] = getattr(client, "_proc", None)
        tools = client.list_tools() or []
        results.setdefault(name, {
            "server": name, "status": "ok",
            "tools": [{"name": t.get("name", "?"),
                       "description": (t.get("description") or "")[:140]}
                      for t in tools if isinstance(t, dict)],
            "latency_ms": int((_time.time() - start) * 1000),
            "error": None,
        })
    except MCPError as e:
        is_timeout = "timeout" in e.code.lower() or "timeout" in e.message.lower()
        results.setdefault(name, {
            "server": name,
            "status": "timeout" if is_timeout else "error",
            "tools": [], "error": f"[{e.code}] {e.message}"[:160],
        })
    except Exception as e:  # noqa: BLE001 — one dead server must not sink the fleet
        results.setdefault(name, {
            "server": name, "status": "error", "tools": [],
            "error": str(e)[:160],
        })
    finally:
        _ACTIVE_PROCS.pop(name, None)
        slots.release()
        if client is not None:
            try:
                client.close()
            except Exception:  # noqa: BLE001 — close is best-effort cleanup
                pass


def _kill_stuck(name: str) -> None:
    """Kill the child of a timed-out probe so its readline thread drains."""
    proc = _ACTIVE_PROCS.pop(name, None)
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.kill()
    except OSError:
        pass


def _run_probes(jobs: list[tuple[str, dict]], timeout: float) -> list[dict]:
    """Probe (name, cfg) pairs in parallel under one overall deadline.

    Wall time ≈ slowest probe, not the sum (UX-A2); a server that goes
    quiet becomes status="timeout" — never a hang. Probe children are
    capped by ProbeSlots (R17) so a big fleet cannot spawn an npx bomb.
    """
    import threading

    from ..probeslots import ProbeSlots

    results: dict[str, dict] = {}
    threads = []
    slots = ProbeSlots()
    slots.begin_sweep(timeout)
    for name, cfg in jobs:
        t = threading.Thread(target=_probe_one, args=(name, cfg, timeout, results, slots),
                             daemon=True)
        threads.append((name, t))
    for _, t in threads:
        t.start()
    deadline = _time.time() + timeout + 2.0  # grace for spawn/handshake overhead
    for name, t in threads:
        t.join(max(0.0, deadline - _time.time()))
        if name not in results:
            results[name] = {
                "server": name, "status": "timeout", "tools": [],
                "error": f"no answer within {timeout}s (inventory probe)",
            }
            _kill_stuck(name)
            t.join(1.0)
    return [results[name] for name, _ in threads]


def inventory(refresh: bool = False, timeout: float = 8.0) -> dict:
    """Probe every MCP server on this machine: adopted + discovered-not-yet.

    tools_total is the headline: the real count of tools ToonDeck manages
    (adopted) plus what it has found ready to adopt. Cached 2 min so the
    dashboard stays fast; refresh=True forces a live re-probe. UX-A2:
    probes run in parallel under a hard deadline — no serial sum of
    latencies, no hang on a server that stops answering.
    """
    now = _time.time()
    if not refresh and _CACHE["data"] is not None and now - _CACHE["ts"] < _CACHE_TTL:
        return _CACHE["data"]

    from mcptoon import config as mcptoon_config

    from .. import mcpcompat  # noqa: F401 — Windows stdio shim must be active

    adopted_names = set(mcptoon_config.list_servers())

    jobs: list[tuple[str, dict]] = []
    for name in sorted(adopted_names):
        jobs.append((name, mcptoon_config.get_server_config(name) or {}))

    disc = scan()
    by_name = {c["name"]: c for c in disc["candidates"]}
    for name in sorted(set(by_name) - adopted_names):
        c = by_name[name]
        cfg = (
            {"command": c["command"], "args": c.get("args", [])}
            if c["transport"] == "stdio"
            else {"url": c.get("url", "")}
        )
        jobs.append((name, cfg))

    probed = _run_probes(jobs, timeout)

    servers: list[dict] = []
    for e in probed:
        e["adopted"] = e["server"] in adopted_names
        e["tool_count"] = len(e["tools"])
        servers.append(e)

    tools_total = sum(s["tool_count"] for s in servers)
    attrs = attributions()
    by_source: dict[str, int] = {}
    for s in servers:
        for src in attrs.get(s["server"], ["toondeck"]):
            by_source[src] = by_source.get(src, 0) + s["tool_count"]

    out = {
        "checked": len(servers),
        "adopted_total": len(adopted_names),
        "discovered_total": len(servers) - len(adopted_names),
        "tools_total": tools_total,
        "by_source": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        "servers": servers,
        "probed_at": now,
    }
    _CACHE["ts"] = now
    _CACHE["data"] = out
    return out
