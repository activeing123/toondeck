"""deck.engine — narrow bridge to the mcptoon engine (M1).

Operations (frozen contract):
- get_state()    → full server/tool view read from the mcptoon engine
- toggle()       → flip one tool's enabled flag
- request_sync() → push the single source of truth to every agent config
- check_health() → live probe all servers (explicit, never implicit)

Secrecy guarantee: server env/header VALUES never appear in state — key names only.
"""

from __future__ import annotations

from . import _internal


def get_state() -> dict:
    import mcptoon.config as mcfg

    servers = mcfg.load_config()
    per_server_disabled: dict[str, list[str]] = {}
    for key, enabled in mcfg.load_toggles().items():
        if not enabled and ":" in key:
            server, tool = key.split(":", 1)
            per_server_disabled.setdefault(server, []).append(tool)

    out = []
    try:
        from .. import mcpdiscover

        attributions = mcpdiscover.attributions()
    except Exception:  # noqa: BLE001 — attribution is decoration, never breaks state
        attributions = {}
    for name in sorted(servers):
        cfg = servers[name]
        tool_total, cache_age = _internal.cache_meta(name)
        out.append(
            {
                "name": name,
                "transport": cfg.get("transport", "stdio"),
                "target": _internal.target_of(cfg),
                "env_keys": _internal.key_names(cfg.get("env")),
                "header_keys": _internal.key_names(cfg.get("headers")),
                "disabled_tools": sorted(per_server_disabled.get(name, [])),
                "tool_total": tool_total,
                "cache_age_s": cache_age,
                "sources": attributions.get(name, ["toondeck"]),
            }
        )
    return {
        "servers": out,
        "server_total": len(out),
        "disabled_total": sum(len(v) for v in per_server_disabled.values()),
        "config_path": str(mcfg._config_file()),
        "token_savings": _internal.token_savings(),
    }


def toggle(server: str, tool: str) -> bool:
    import mcptoon.config as mcfg

    return mcfg.toggle_tool(server, tool)


def request_sync() -> list[dict]:
    """Push the single source of truth to every detected agent config."""
    return _internal.sync_to_all()


def check_health(timeout: float = 10.0) -> dict:
    """Live probe every configured server. Explicit action, costs real connections.

    Probes via the toondeck-owned legacy path (UX-A1): initialize handshake
    first, one daemon thread per server, overall deadline — a server that
    never answers becomes status="timeout" and the endpoint can no longer
    hang (R1/R2: mcptoon's spec="auto" discover probe is silently ignored
    by MCP-SDK servers, and mcptoon's stdio readline never times out).
    Seam: _internal.check_all (monkeypatched by tests) → check_all_legacy.
    """
    results = _internal.check_all(timeout=timeout)
    return {"checked": len(results), "results": results}
