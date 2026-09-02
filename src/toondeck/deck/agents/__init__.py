"""deck.agents — pluggable agent adapters: detect / configure / launch / stop (M3).

Operations (frozen contract):
- detect_all() → probe the 7 first-class agents (adapter JSON driven), honest evidence
- launch()     → spawn + stream logs into the console (read-only)   [M3b]
- stop()       → terminate a launched agent cleanly                  [M3b]
- configure()  → env/profile injection (M4 vault handoff)
"""

from pathlib import Path


def detect_all() -> dict:
    """Probe every adapter; returns {agents: [...], total, installed_count}."""
    from . import internal
    from .internal import probes

    adapters = internal.load_all()
    results = [probes.detect(a) for a in adapters.values()]
    return {
        "agents": results,
        "total": len(results),
        "installed_count": sum(1 for r in results if r["installed"]),
    }


def launch(agent_id: str, cwd: str | None = None) -> dict:
    """Spawn the agent process; logs stream into the console ring buffer."""
    from . import internal
    from .internal import manager

    adapters = internal.load_all()
    adapter = adapters.get(agent_id)
    if adapter is None:
        return {"ok": False, "error": f"unknown agent: {agent_id}"}
    return manager.get_manager().launch(agent_id, adapter, Path(cwd) if cwd else None)


def status(agent_id: str) -> dict:
    """Live snapshot: state, exit code, recent (redacted) logs."""
    from .internal import manager

    return manager.get_manager().status(agent_id)


def status_all() -> dict:
    """Compact state map for every process this deck has launched."""
    from .internal import manager

    return manager.get_manager().status_all()


def stop(agent_id: str) -> dict:
    """Terminate a launched agent; reaps the exit code."""
    from .internal import manager

    return manager.get_manager().stop(agent_id)


def log_channel(agent_id: str) -> dict | None:
    """WS support: {'snapshot': [...], 'queue': Queue} or None if never launched."""
    from .internal import manager

    proc = manager.get_manager().procs.get(agent_id)
    if proc is None:
        return None
    return {"snapshot": proc.snapshot(), "queue": proc.subscribe()}


def log_unsubscribe(agent_id: str, q: "object") -> None:
    from .internal import manager

    proc = manager.get_manager().procs.get(agent_id)
    if proc is not None:
        proc.unsubscribe(q)


def configure() -> dict:
    raise NotImplementedError("deck.agents.configure lands in M4")
