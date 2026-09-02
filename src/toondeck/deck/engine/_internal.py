"""deck.engine internals — mcptoon library bridge details. Not for cross-module import."""

from __future__ import annotations

import json
import threading
import time

import mcptoon.cache as mcache
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
    """Seam (tests monkeypatch this name) → legacy+deadline probe in production."""
    return check_all_legacy(**kwargs)


# child processes of in-flight probes, by server name — lets the joiner kill
# a timed-out probe's subprocess so its blocked readline thread drains (EOF)
# instead of leaking until process exit.
_ACTIVE_PROCS: dict[str, object] = {}


def check_all_legacy(timeout: float = 10.0) -> list[dict]:
    """Toondeck-owned health probe: legacy handshake, one thread per server.

    Why not mcptoon.health.check_all (R1/R2 evidence, 2026-09-02): it builds
    MCPClient with spec="auto", whose 2026-07-28 `server/discover` probe is
    silently ignored by MCP-SDK servers (verified against mcp_server_fetch
    2026.8.18: zero bytes back, not even a -32601 error) — and mcptoon's
    stdio readline has no timeout, so that probe hangs forever. The legacy
    initialize-first handshake works for every real server; this is also
    why all deck code must pass spec="legacy" (project red line).

    Implementation: one daemon thread per server, joined under an overall
    deadline. A thread that misses the deadline gets a forced
    status="timeout" verdict and its child process is killed (the blocked
    readline drains on EOF) — one dead server can never hang the fleet.
    Subprocess concurrency is capped by ProbeSlots (R17): npx cold starts
    fork node trees, and 50 simultaneous children would starve healthy probes.
    """
    import mcptoon.config as mcfg

    from .. import mcpcompat  # noqa: F401 — Windows stdio shim must be active
    from ..probeslots import ProbeSlots

    names = sorted(mcfg.list_servers())
    results: dict[str, dict] = {}
    threads: list[tuple[str, threading.Thread]] = []
    slots = ProbeSlots()
    slots.begin_sweep(timeout)

    for name in names:
        t = threading.Thread(target=_probe_one_legacy, args=(name, timeout, results, slots),
                             daemon=True)
        threads.append((name, t))

    for _, t in threads:
        t.start()
    deadline = time.time() + timeout + 2.0  # grace for spawn/handshake overhead
    for name, t in threads:
        t.join(max(0.0, deadline - time.time()))
        if name not in results:  # missed the deadline
            results[name] = {
                "server": name,
                "transport": "?",
                "status": "timeout",
                "tools": 0,
                "latency_ms": int(timeout * 1000),
                "error": f"no answer within {timeout}s (legacy probe)",
            }
            _kill_stuck_probe(name)  # drain the blocked thread's child
            t.join(1.0)

    return [results[name] for name in names]


def _probe_one_legacy(name: str, timeout: float, results: dict, slots) -> None:
    """Probe one server via the legacy handshake; always writes a verdict.

    Runs in a daemon thread; every failure becomes a status, never an
    exception that would leave the joiner without a result slot.
    Lifecycle is managed manually (initialize → list_tools → close) so the
    child proc can be registered for the joiner's deadline kill right
    after the handshake — the observed hang site is list_tools.
    A probe child slot is held for the whole probe; if none frees up before
    the sweep deadline, an honest timeout verdict is written instead.
    """
    import mcptoon.config as mcfg
    from mcptoon.client import MCPClient, MCPError

    if not slots.acquire(timeout):
        results.setdefault(name, {
            "server": name, "transport": "?", "status": "timeout",
            "tools": 0, "latency_ms": int(timeout * 1000),
            "error": f"probe slot unavailable within {timeout}s (fleet cap)",
        })
        return
    start = time.time()
    client: MCPClient | None = None
    try:
        cfg = mcfg.get_server_config(name)
        if not cfg:
            results.setdefault(name, {"server": name, "transport": "?", "status": "no-config",
                                      "tools": 0, "latency_ms": 0, "error": "no config"})
            return
        transport = cfg.get("transport", "stdio")
        if transport == "http":
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
            "server": name, "transport": transport, "status": "ok",
            "tools": len(tools),
            "latency_ms": int((time.time() - start) * 1000),
            "error": None,
        })
    except MCPError as e:
        is_timeout = "timeout" in e.code.lower() or "timeout" in e.message.lower()
        results.setdefault(name, {
            "server": name, "transport": "?",
            "status": "timeout" if is_timeout else "error",
            "tools": 0,
            "latency_ms": int((time.time() - start) * 1000),
            "error": f"[{e.code}] {e.message}"[:160],
        })
    except Exception as e:  # noqa: BLE001 — a broken probe is a verdict, not a crash
        results.setdefault(name, {
            "server": name, "transport": "?", "status": "error",
            "tools": 0,
            "latency_ms": int((time.time() - start) * 1000),
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


def _kill_stuck_probe(name: str) -> None:
    """Kill the child of a timed-out probe so its readline thread drains."""
    proc = _ACTIVE_PROCS.pop(name, None)
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.kill()
    except OSError:
        pass


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
