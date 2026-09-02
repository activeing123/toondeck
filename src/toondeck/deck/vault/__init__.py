"""deck.vault — keyring-backed API key vault (M4).

Operations (frozen contract):
- set_key()      → store a provider key in the OS keychain (never plaintext)
- test()         → real connectivity probe against a provider
- resolve_env()  → env map for agent launch wrapping (injection, no echo)

Secrets NEVER touch disk metadata, HTTP responses, or the browser round-trip.
"""

from __future__ import annotations

from .internal import meta, store
from .internal import providers as _providers


def set_key(provider: str, secret: str) -> dict:
    catalog = _providers.load_all()
    if provider not in catalog:
        return {"ok": False, "error": f"unknown provider: {provider}"}
    if not secret or not secret.strip():
        return {"ok": False, "error": "empty secret"}
    if catalog[provider].get("local"):
        return {"ok": False, "error": f"{provider} is a local provider; no key needed"}
    try:
        store.set_secret(provider, secret.strip())
    except Exception as e:  # noqa: BLE001 — keychain backend errors are reportable
        return {"ok": False, "error": f"keychain error: {e}"}
    meta.record_stored(provider)
    return {"ok": True, "provider": provider}


def get_state() -> dict:
    """Metadata-only view: which providers are stored/when tested. No secrets."""
    catalog = _providers.load_all()
    data = meta.load_all()
    provs = data.get("providers", {})
    providers = []
    for pid, p in sorted(catalog.items()):
        entry = provs.get(pid, {})
        providers.append(
            {
                "id": pid,
                "display_name": p["display_name"],
                "env_var": p["env_var"],
                "local": p.get("local", False),
                "stored": bool(entry.get("stored")),
                "set_at": entry.get("set_at"),
                "last_test": entry.get("last_test"),
            }
        )
    return {"providers": providers, "stored_count": sum(1 for x in providers if x["stored"])}


def delete_key(provider: str) -> dict:
    if provider not in _providers.load_all():
        return {"ok": False, "error": f"unknown provider: {provider}"}
    store.delete_secret(provider)
    meta.record_removed(provider)
    return {"ok": True, "provider": provider}


def test(provider: str, timeout: float = 12.0) -> dict:
    """Real connectivity probe. Result metadata recorded; secret never echoed."""
    import urllib.error
    import urllib.request

    catalog = _providers.load_all()
    p = catalog.get(provider)
    if p is None:
        return {"ok": False, "error": f"unknown provider: {provider}"}

    headers = {"User-Agent": "toondeck/0.1"}
    secret = store.get_secret(provider)
    if p["auth_style"] == "bearer" and secret:
        headers["Authorization"] = f"Bearer {secret}"
    elif p["auth_style"] == "x-api-key" and secret:
        headers["x-api-key"] = secret
    url = p["test_url"]
    if p["auth_style"] == "query" and secret:
        url = f"{url}?key={secret}"

    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ok = 200 <= resp.status < 300
            result = {"ok": ok, "provider": provider, "status": resp.status}
    except urllib.error.HTTPError as e:
        result = {"ok": False, "provider": provider, "status": e.code,
                  "error": f"HTTP {e.code}"}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        result = {"ok": False, "provider": provider, "status": None,
                  "error": str(e)[:120]}

    meta.record_test(provider, ok=result["ok"],
                     status=str(result.get("status")), detail=result.get("error"))
    return result


def resolve_env(providers: list[str] | None = None) -> dict:
    """Env map for launch wrapping. Values go to the child process env only."""
    if providers is None:
        stored = meta.load_all().get("providers", {})
        providers = [pid for pid, e in stored.items() if e.get("stored")]
    env: dict[str, str] = {}
    for pid in providers:
        env.update(store.provider_env(pid))
    return env


def alias_env(aliases: dict[str, str]) -> dict:
    """{target_env_var: provider_id} -> {target_env_var: secret}.

    Lets agents that read non-catalog env names (e.g. ANTHROPIC_AUTH_TOKEN)
    be fed from a stored provider without the secret crossing the browser.
    """
    env: dict[str, str] = {}
    for target_var, provider in (aliases or {}).items():
        secret = store.get_secret(provider)
        if secret is not None:
            env[target_var] = secret
    return env
