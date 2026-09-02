"""deck.fleet — one aggregated view of everything ToonDeck manages (MCP page hero)."""

from __future__ import annotations


def overview() -> dict:
    from . import agents, engine, mcpdiscover, skills

    st = engine.get_state()
    try:
        disc = mcpdiscover.discover()
    except Exception:  # noqa: BLE001 — discovery is decoration here
        disc = {"total": 0, "sources_scanned": 0}

    det = agents.detect_all()
    agents_list = det.get("agents", [])
    cli_capable = sum(1 for a in agents_list if a.get("launch_command"))

    try:
        sk_state = skills.get_state()
        counts = sk_state.get("counts", {})
    except Exception:  # noqa: BLE001
        counts = {}
    try:
        doc = skills.doctor()
        views_ok = sum(1 for v in doc.get("views", []) if v.get("ok"))
        views_total = len(doc.get("views", []))
    except Exception:  # noqa: BLE001
        views_ok, views_total = 0, 0

    return {
        "mcptoon": {
            "engine": True,
            "servers_total": st["server_total"],
            "tools_cached": st["token_savings"].get("tool_total", 0),
            "disabled_tools": st["disabled_total"],
            "discovered_total": disc.get("total", 0),
            "sources_scanned": disc.get("sources_scanned", 0),
            "sources_breakdown": {
                s["name"]: s.get("sources", []) for s in st["servers"]
            },
            "config_path": st["config_path"],
        },
        "agents": {
            "total": len(agents_list),
            "installed": sum(1 for a in agents_list if a.get("installed")),
            "cli_capable": cli_capable,
        },
        "skills": {
            "total": counts.get("total", 0),
            "valid": counts.get("valid", 0),
            "views_ok": views_ok,
            "views_total": views_total,
        },
    }
