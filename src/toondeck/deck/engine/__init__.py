"""deck.engine — narrow bridge to the mcptoon engine (M1).

Operations (frozen contract):
- get_state()    → full server/tool view read from the mcptoon engine
- toggle()       → flip one tool's enabled flag
- request_sync() → push the single source of truth to every agent config

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
    for name in sorted(servers):
        cfg = servers[name]
        out.append(
            {
                "name": name,
                "transport": cfg.get("transport", "stdio"),
                "target": _internal.target_of(cfg),
                "env_keys": _internal.key_names(cfg.get("env")),
                "header_keys": _internal.key_names(cfg.get("headers")),
                "disabled_tools": sorted(per_server_disabled.get(name, [])),
            }
        )
    return {
        "servers": out,
        "server_total": len(out),
        "disabled_total": sum(len(v) for v in per_server_disabled.values()),
        "config_path": str(mcfg._config_file()),
    }


def toggle(server: str, tool: str) -> bool:
    import mcptoon.config as mcfg

    return mcfg.toggle_tool(server, tool)


def request_sync() -> list[dict]:
    """Push the single source of truth to every detected agent config."""
    return _internal.sync_to_all()
