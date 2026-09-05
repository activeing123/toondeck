"""deck.agents — pluggable agent adapters: detect / configure / launch / stop (M3).

Operations (frozen contract):
- detect_all() → probe the 7 first-class agents (adapter JSON driven), honest evidence
- launch()     → spawn + stream logs into the console (read-only)   [M3b]
- stop()       → terminate a launched agent cleanly                  [M3b]
- configure()  → env/profile injection (M4 vault handoff)
"""

from __future__ import annotations

import re
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


def launch(
    agent_id: str, cwd: str | None = None, args: list[str] | None = None,
    env_extra: dict[str, str] | None = None, window: bool | None = None,
    profile: str | None = None,
) -> dict:
    """Spawn the agent process; TUI adapters default to a new console window.

    profile: name of a model profile (T-067) — its base_url/keyring key are
    injected as env on top of env_extra.
    """
    from . import internal
    from .internal import manager

    adapters = internal.load_all()
    adapter = adapters.get(agent_id)
    if adapter is None:
        return {"ok": False, "error": f"unknown agent: {agent_id}"}
    profile_env = profile_launch_env(profile) if profile else None
    return manager.get_manager().launch(
        agent_id, adapter, Path(cwd) if cwd else None, args, env_extra, window,
        profile_env=profile_env,
    )


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
    """WS support: {'snapshot': [...], 'queue': Queue, 'capture_mode': str} or None if never launched."""
    from .internal import manager

    proc = manager.get_manager().procs.get(agent_id)
    if proc is None:
        return None
    return {
        "snapshot": proc.snapshot(),
        "queue": proc.subscribe(),
        "capture_mode": getattr(proc, "capture_mode", "pipe"),
    }


def log_unsubscribe(agent_id: str, q: "object") -> None:
    from .internal import manager

    proc = manager.get_manager().procs.get(agent_id)
    if proc is not None:
        proc.unsubscribe(q)


def log_download(agent_id: str) -> dict:
    """Full log dump as a downloadable agent-ready report (T-068).

    Markdown envelope: context (agent, adapter, state, exit code, timestamps)
    + the complete ring buffer. Logs are already redacted at capture time,
    so the file is safe to hand to any AI agent for self-repair analysis.
    """
    import time as _time

    from . import internal
    from .internal import manager

    adapters = internal.load_all()
    adapter = adapters.get(agent_id) or {}
    proc = manager.get_manager().procs.get(agent_id)
    st = status(agent_id)
    lines = st.get("logs", [])
    started = (
        _time.strftime("%Y-%m-%d %H:%M:%S", _time.localtime(st["started_at"]))
        if st.get("started_at")
        else "n/a"
    )
    header = [
        "# ToonDeck agent log report",
        "",
        f"- agent: {agent_id} ({adapter.get('display_name', '?')})",
        f"- state: {st.get('state', 'never')} · exit_code: {st.get('exit_code')}",
        f"- launched_at: {started}",
        f"- launch_command: {' '.join(adapter.get('launch_command', [])) or 'n/a'}",
        f"- model: {get_model(agent_id) or '(agent default)'}",
        f"- capture_mode: {'window (TUI streams to the desktop console; the ring only records pipe launches)' if adapter.get('tui') else 'pipe'}",
        f"- exported_at: {_time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- lines: {len(lines)}",
        "",
        "## Task for the analyzing agent",
        "",
        "Diagnose why this agent failed or misbehaved from the log below.",
        "Answer with: (1) root cause, (2) evidence lines, (3) concrete fix",
        "(config edit / command / reinstall), (4) how to verify the fix.",
        "",
        "## Full log",
        "",
        "```",
    ]
    body = header + list(lines) + ["```", ""]
    return {
        "agent_id": agent_id,
        "content": "\n".join(body),
        "lines": len(lines),
        "has_process": proc is not None,
    }


# ---- per-agent model preference (T-061) --------------------------------


def _models_file():
    import os
    from pathlib import Path

    home = os.environ.get("TOONDECK_HOME")
    root = Path(home) if home else Path.home() / ".toondeck"
    return root / "agents.json"


def _load_models() -> dict:
    import json

    f = _models_file()
    if f.is_file():
        try:
            return json.loads(f.read_text(encoding="utf-8")).get("models", {})
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_models(models: dict) -> None:
    import json

    f = _models_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({"models": models}, indent=2), encoding="utf-8")


# ── model profiles (T-067): named "provider/model" sources the user defines ──

_VALID_PROFILE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,30}")


def _load_profiles() -> dict:
    import json

    f = _models_file()
    if f.is_file():
        try:
            return json.loads(f.read_text(encoding="utf-8")).get("profiles", {})
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_profiles(profiles: dict) -> None:
    import json

    f = _models_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(f.read_text(encoding="utf-8")) if f.is_file() else {}
    data["profiles"] = profiles
    f.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def list_profiles() -> dict:
    return _load_profiles()


def _keyring_unavailable(exc: Exception) -> dict:
    """A machine-readable token, never a raw traceback string.

    CLEAN-ROOM AUDIT 2026-09-05 (cross-platform leg): this box has a Windows
    credential manager, so the happy path was all the suite ever exercised. On
    a headless Linux server — or any machine with no Secret Service — keyring
    raises at set_password time and the deck used to forward the raw English
    exception into a toast. The user could neither read nor act on it. The UI
    maps this token to a localized, actionable hint and keeps the detail for
    anyone who wants the real cause.
    """
    return {"ok": False, "error": "keyring_unavailable", "detail": str(exc)}


def add_profile(name: str, base_url: str | None = None, api_key: str | None = None) -> dict:
    """Define a custom model source (e.g. my-proxy → https://…/v1 + key).

    The api_key, if given, is stored in the OS keyring under
    toondeck://model-profile/<name> — never in the JSON file.
    """
    if not _VALID_PROFILE.fullmatch(name):
        return {"ok": False, "error": f"bad profile name: {name!r}"}
    profiles = _load_profiles()
    entry: dict = {}
    if base_url:
        entry["base_url"] = base_url
    if api_key:
        try:
            import keyring

            keyring.set_password("toondeck://model-profile", name, api_key)
            entry["keyring"] = True
        except Exception as e:  # noqa: BLE001 — keyring failures must be visible
            return _keyring_unavailable(e)
    profiles[name] = entry
    _save_profiles(profiles)
    return {"ok": True, "name": name}


def edit_profile(name: str, base_url: str | None = None, api_key: str | None = None) -> dict:
    """Merge-edit an existing profile (R46 UI dialog).

    Unlike add_profile (which REPLACES the entry and would silently drop the
    keyring flag), edit_profile changes only what the caller actually passed:
    base_url=None keeps the current URL, api_key=None keeps the stored key.
    """
    if not _VALID_PROFILE.fullmatch(name or ""):
        return {"ok": False, "error": f"bad profile name: {name!r}"}
    profiles = _load_profiles()
    if name not in profiles:
        return {"ok": False, "error": f"unknown profile: {name}"}
    entry = profiles[name]
    if base_url is not None:
        stripped = base_url.strip()
        if stripped:
            entry["base_url"] = stripped
        else:
            entry.pop("base_url", None)  # explicit empty string clears the URL
    if api_key is not None:
        stripped_key = api_key.strip()
        if stripped_key:
            try:
                import keyring

                keyring.set_password("toondeck://model-profile", name, stripped_key)
                entry["keyring"] = True
            except Exception as e:  # noqa: BLE001 — keyring failures must be visible
                return _keyring_unavailable(e)
        else:
            entry.pop("keyring", None)  # explicit empty string clears the key
            try:
                import keyring

                keyring.delete_password("toondeck://model-profile", name)
            except Exception:  # noqa: BLE001 — entry may not exist in the keyring
                pass
    profiles[name] = entry
    _save_profiles(profiles)
    return {"ok": True, "name": name}


def remove_profile(name: str) -> dict:
    profiles = _load_profiles()
    if name not in profiles:
        return {"ok": False, "error": f"unknown profile: {name}"}
    profiles.pop(name)
    _save_profiles(profiles)
    try:
        import keyring

        keyring.delete_password("toondeck://model-profile", name)
    except Exception:  # noqa: BLE001 — entry may not exist in the keyring
        pass
    return {"ok": True, "name": name}


def profile_launch_env(name: str) -> dict[str, str]:
    """Env for launching with a model profile: base_url + key from keyring."""
    env: dict[str, str] = {}
    entry = _load_profiles().get(name)
    if not entry:
        return env
    if entry.get("base_url"):
        env["OPENAI_BASE_URL"] = entry["base_url"]
        env["ANTHROPIC_BASE_URL"] = entry["base_url"]
    try:
        import keyring

        key = keyring.get_password("toondeck://model-profile", name)
        if key:
            env["OPENAI_API_KEY"] = key
            env["ANTHROPIC_API_KEY"] = key
    except Exception:  # noqa: BLE001
        pass
    return env


# ── provider catalog (T-069): the mature-product UX — curated sources, prefill everything ──

PROVIDER_CATALOG: list[dict] = [
    {
        "id": "anthropic",
        "display_name": "Anthropic",
        "base_url": "https://api.anthropic.com",
        "models": ["claude-sonnet-4-5", "claude-opus-4-6", "claude-haiku-4-5"],
        "keyless": False,
    },
    {
        "id": "openai",
        "display_name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-5.2", "gpt-5.2-codex", "o4-mini"],
        "keyless": False,
    },
    {
        "id": "deepseek",
        "display_name": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "keyless": False,
    },
    {
        "id": "dashscope",
        "display_name": "DashScope / Qwen",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-max", "qwen3-coder-plus", "glm-4.7", "kimi-k2"],
        "keyless": False,
    },
    {
        "id": "openrouter",
        "display_name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "models": [
            "anthropic/claude-sonnet-4.5",
            "openai/gpt-5.2",
            "deepseek/deepseek-chat-v3.2",
            "z-ai/glm-4.7",
        ],
        "keyless": False,
    },
    {
        "id": "ollama",
        "display_name": "Ollama (local)",
        "base_url": "http://localhost:11434/v1",
        "models": ["qwen3:32b", "llama4", "glm-4.7-air"],
        "keyless": True,
    },
]


def provider_catalog() -> list[dict]:
    """Curated providers + whether each is already configured (profile saved).

    N-R12: configured profiles also merge their cached live model list, so
    the GUI can offer fresh models instead of a stale curated guess.
    """
    profiles = _load_profiles()
    out = []
    for p in PROVIDER_CATALOG:
        entry = {**p, "configured": p["id"] in profiles}
        prof = profiles.get(p["id"], {})
        if "models_cache" in prof:
            entry["models"] = prof["models_cache"]
            entry["models_cache_count"] = len(prof["models_cache"])
        out.append(entry)
    # custom profiles (user-added sources) appear as first-class rows too
    known = {p["id"] for p in PROVIDER_CATALOG}
    for name, prof in profiles.items():
        if name in known:
            continue
        out.append(
            {
                "id": name,
                "display_name": name,
                "base_url": prof.get("base_url", ""),
                "models": prof.get("models_cache", []),
                "models_cache_count": len(prof.get("models_cache", [])),
                "keyless": False,
                "configured": True,
            }
        )
    return out


def _profile_auth(name: str) -> tuple[str | None, str | None]:
    """(base_url, api_key) for a configured profile; key from the keyring."""
    profiles = _load_profiles()
    prof = profiles.get(name)
    if prof is None:
        return None, None
    key = None
    if prof.get("keyring"):
        try:
            import keyring

            key = keyring.get_password("toondeck://model-profile", name)
        except Exception:  # noqa: BLE001 — missing keyring yields a clear error
            key = None
    return prof.get("base_url"), key


def refresh_provider_models(name: str) -> dict:
    """N-R12: pull the live model list from the provider and cache it.

    Speaks both OpenAI (`/models`, Bearer) and Anthropic (`/v1/models`,
    x-api-key) shapes. The cache lands on the profile JSON so the catalog
    serves fresh names without any network call.
    """
    base_url, key = _profile_auth(name)
    if not base_url:
        return {"ok": False, "error": f"unknown profile: {name}"}
    import httpx

    headers: dict[str, str] = {}
    if key:
        headers["Authorization"] = f"Bearer {key}"
        headers["x-api-key"] = key
    url = base_url.rstrip("/")
    if not url.endswith("/models"):
        url += "/models"
    try:
        r = httpx.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:  # noqa: BLE001 — network errors must be readable
        return {"ok": False, "error": f"fetch models: {e}"}
    items = data.get("data", data) if isinstance(data, dict) else data
    models: list[str] = []
    for it in items or []:
        mid = it.get("id") or it.get("name") if isinstance(it, dict) else it
        if isinstance(mid, str) and mid:
            models.append(mid)
    if not models:
        return {"ok": False, "error": "provider returned no models"}
    profiles = _load_profiles()
    profiles.setdefault(name, {})["models_cache"] = sorted(models)
    _save_profiles(profiles)
    return {"ok": True, "name": name, "models": sorted(models), "count": len(models)}


def test_provider_chat(name: str) -> dict:
    """N-R12: one tiny chat round-trip so a novice can verify a source.

    Asks the model to reply with exactly "pong" — 3 seconds, honest result.
    """
    base_url, key = _profile_auth(name)
    if not base_url:
        return {"ok": False, "error": f"unknown profile: {name}"}
    import httpx

    profiles = _load_profiles()
    models = profiles.get(name, {}).get("models_cache") or []
    model = models[0] if models else "default"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    url = base_url.rstrip("/")
    if url.endswith("/models"):
        url = url[: -len("/models")]
    if not url.endswith("/chat/completions"):
        url += "/chat/completions"
    payload = {
        "model": model,
        "max_tokens": 8,
        "messages": [{"role": "user", "content": "Reply with exactly: pong"}],
    }
    try:
        r = httpx.post(url, headers=headers, json=payload, timeout=20)
        r.raise_for_status()
        data = r.json()
        reply = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    except Exception as e:  # noqa: BLE001 — errors must be readable
        return {"ok": False, "error": f"chat test: {e}"}
    return {"ok": True, "name": name, "model": model, "reply": (reply or "").strip()}


def set_model(agent_id: str, model: str | None) -> dict:
    """Persist (or clear with None) the preferred model for one agent."""
    models = _load_models()
    if model is None:
        models.pop(agent_id, None)
    else:
        models[agent_id] = model
    _save_models(models)
    return {"ok": True, "agent_id": agent_id, "model": model}


def get_model(agent_id: str) -> str | None:
    return _load_models().get(agent_id)


def get_models() -> dict:
    return _load_models()


def set_source(agent_id: str, profile: str | None) -> dict:
    """Persist which model profile (API source) an agent launches with."""
    import json

    f = _models_file()
    data = json.loads(f.read_text(encoding="utf-8")) if f.is_file() else {}
    sources = data.get("sources", {})
    if profile is None:
        sources.pop(agent_id, None)
    else:
        sources[agent_id] = profile
    data["sources"] = sources
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {"ok": True, "agent_id": agent_id, "source": profile}


def get_sources() -> dict:
    import json

    f = _models_file()
    if f.is_file():
        try:
            return json.loads(f.read_text(encoding="utf-8")).get("sources", {})
        except Exception:  # noqa: BLE001
            return {}
    return {}


def configure() -> dict:
    raise NotImplementedError("deck.agents.configure lands in M4")
