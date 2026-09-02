"""Keyring store — the ONLY module that ever touches a secret value.

Tests swap the module-level `_keyring` attribute for a stub; production uses
the real OS keychain via the `keyring` package (service name: "toondeck").
"""

from __future__ import annotations

import keyring as _keyring

SERVICE = "toondeck"


def set_secret(provider: str, secret: str) -> None:
    _keyring.set_password(SERVICE, provider, secret)


def get_secret(provider: str) -> str | None:
    return _keyring.get_password(SERVICE, provider)


def delete_secret(provider: str) -> None:
    try:
        _keyring.delete_password(SERVICE, provider)
    except Exception:  # noqa: BLE001 — deleting a missing key must not explode
        pass


def provider_env(provider: str) -> dict[str, str]:
    """Env map for one provider (env_var -> secret). Empty when not stored."""
    from . import providers as _providers_mod

    catalog = _providers_mod.load_all()
    p = catalog.get(provider)
    if p is None:
        return {}
    secret = get_secret(provider)
    if secret is None:
        return {}
    return {p["env_var"]: secret}
