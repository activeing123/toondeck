"""deck.agents — pluggable agent adapters: detect / configure / launch (M3).

Contract (frozen M0; implementation lands in M3):
- detect_all() → probe the 7 first-class agents (adapter JSON driven)
- launch()     → spawn + stream logs into the console (read-only)
- stop()       → terminate a launched agent cleanly
"""

def _not_impl(name: str):
    def _f(*args, **kwargs):
        raise NotImplementedError(f"deck.agents.{name} lands in M3")
    return _f


detect_all = _not_impl("detect_all")
launch = _not_impl("launch")
stop = _not_impl("stop")
