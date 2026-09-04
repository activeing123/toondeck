"""Provider catalog — built-in providers + user-defined layer.

R48: the shipped catalog (providers.json, read-only, upgrade-safe) merges
with a user layer at TOONDECK_HOME/vault-providers.json. User entries WIN on
id collision (override a built-in's base_url/test_url without touching the
package), and packge entries are never written to.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import PROVIDERS_JSON

# user layer: TOONDECK_HOME/vault-providers.json (same home as vault.json)
_VALID_ID = re.compile(r"[a-z][a-z0-9_-]{0,30}")
_VALID_STYLE = {"bearer", "x-api-key", "query", "none"}


def user_providers_file() -> Path:
    from . import vault_home

    return vault_home() / "vault-providers.json"


def _load_user() -> dict:
    f = user_providers_file()
    if not f.is_file():
        return {}
    try:
        raw = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}  # corrupt user layer must not take the catalog down
    return raw.get("providers", {}) if isinstance(raw, dict) else {}


def _save_user(providers: dict) -> None:
    f = user_providers_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(
        json.dumps({"providers": providers}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def load_all() -> dict:
    """Built-in catalog merged with the user layer (user wins on collision)."""
    catalog = json.loads(PROVIDERS_JSON.read_text(encoding="utf-8"))
    catalog.update(_load_user())
    return catalog


def user_defined_ids() -> set[str]:
    return set(_load_user().keys())


def validate(p: dict, *, builtin: dict | None = None) -> dict | str:
    """Return a cleaned provider dict, or an error string. Trimmed + typed."""
    if not isinstance(p, dict):
        return "provider must be an object"
    pid = str(p.get("id", "")).strip().lower()
    if not _VALID_ID.fullmatch(pid):
        return f"bad provider id: {pid!r} (lowercase letters/digits/-/_, start with a letter)"
    display = str(p.get("display_name", "")).strip()
    if not display:
        return "display_name is required"
    env_var = str(p.get("env_var", "")).strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,40}", env_var):
        return f"bad env_var: {env_var!r}"
    base_url = str(p.get("base_url", "")).strip()
    if not base_url.startswith(("http://", "https://")):
        return "base_url must start with http:// or https://"
    test_url = str(p.get("test_url", "")).strip() or base_url
    if not test_url.startswith(("http://", "https://")):
        return "test_url must start with http:// or https://"
    auth_style = str(p.get("auth_style", "bearer")).strip().lower()
    if auth_style not in _VALID_STYLE:
        return f"auth_style must be one of {sorted(_VALID_STYLE)}"
    cleaned = {
        "id": pid,
        "display_name": display,
        "env_var": env_var,
        "base_url": base_url,
        "test_url": test_url,
        "auth_style": auth_style,
        "local": bool(p.get("local", False)),
    }
    if builtin is not None:
        cleaned["builtin"] = True
    return cleaned


def upsert(p: dict) -> dict | str:
    """Create or override a provider in the user layer. Returns cleaned dict or error."""
    pid = str(p.get("id", "")).strip().lower()
    builtin = json.loads(PROVIDERS_JSON.read_text(encoding="utf-8")).get(pid)
    cleaned = validate(p, builtin=builtin is not None)
    if isinstance(cleaned, str):
        return cleaned
    user = _load_user()
    user[pid] = cleaned
    _save_user(user)
    return cleaned


def remove(pid: str) -> dict | str:
    """Remove a user-layer entry. Built-ins have no user layer entry → error."""
    user = _load_user()
    if pid not in user:
        return f"unknown user-defined provider: {pid} (built-ins cannot be deleted)"
    user.pop(pid)
    _save_user(user)
    return {"ok": True, "provider": pid}
