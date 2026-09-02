"""deck.engine — narrow bridge to the mcptoon engine (M1).

Contract (frozen M0; implementation lands in M1):
- get_state()      → full server/tool view read from the mcptoon engine
- toggle()         → flip one tool's enabled flag
- request_sync()   → push the single source of truth to every agent config
"""


def _not_impl(name: str):
    def _f(*args, **kwargs):
        raise NotImplementedError(f"deck.engine.{name} lands in M1")

    return _f


get_state = _not_impl("get_state")
toggle = _not_impl("toggle")
request_sync = _not_impl("request_sync")
