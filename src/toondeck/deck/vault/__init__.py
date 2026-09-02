"""deck.vault — keyring-backed API key vault (M4).

Contract (frozen M0; implementation lands in M4):
- set_key()      → store a provider key in the OS keychain (never plaintext)
- test()         → real connectivity probe against a provider
- resolve_env()  → env map for agent launch wrapping (injection, no echo)
"""

def _not_impl(name: str):
    def _f(*args, **kwargs):
        raise NotImplementedError(f"deck.vault.{name} lands in M4")
    return _f


set_key = _not_impl("set_key")
test = _not_impl("test")
resolve_env = _not_impl("resolve_env")
