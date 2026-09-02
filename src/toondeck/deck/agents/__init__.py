"""deck.agents — pluggable agent adapters: detect / configure / launch / stop (M3).

Operations (frozen contract):
- detect_all() → probe the 7 first-class agents (adapter JSON driven), honest evidence
- launch()     → spawn + stream logs into the console (read-only)   [M3b]
- stop()       → terminate a launched agent cleanly                  [M3b]
- configure()  → env/profile injection (M4 vault handoff)
"""


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


def _not_impl(name: str):
    def _f(*args, **kwargs):
        raise NotImplementedError(f"deck.agents.{name} lands in M3")

    return _f


launch = _not_impl("launch")
stop = _not_impl("stop")
configure = _not_impl("configure")
