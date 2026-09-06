"""deck.api.app — FastAPI app factory (thin shell; logic lives in deck.* modules).

Route order matters: real API routes register BEFORE the SPA catch-all.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from importlib import metadata
from typing import Any

from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from .. import agentdiscover
from .. import agents
from .. import engine
from .. import journal
from .. import mcpdiscover
from .. import skills
from .. import vault
from .. import mcpcompat  # noqa: F401 — Windows stdio .cmd shim for mcptoon (T-064)
from . import static

# singleflight executor for concurrent refresh=1 sweeps (one worker = natural dedupe)
_REFRESH_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="inv-refresh")
_REFRESH_SINGLE_LOCK = threading.Lock()
_REFRESH_INFLIGHT: dict[str, Any] = {}

# same treatment for health checks: the frontend's 35s-abort retries can stack
# N identical sweeps; distinct clamped timeouts queue on the single worker,
# which also caps cross-timeout storms
_HEALTH_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mcp-health")
_HEALTH_LOCK = threading.Lock()
_HEALTH_INFLIGHT: dict[float, Any] = {}


def _health_singleflight(timeout: float) -> dict:
    with _HEALTH_LOCK:
        fut = _HEALTH_INFLIGHT.get(timeout)
        if fut is None:
            fut = _HEALTH_EXECUTOR.submit(engine.check_health, timeout=timeout)
            _HEALTH_INFLIGHT[timeout] = fut
    try:
        return fut.result(timeout=timeout + 90.0)
    finally:
        with _HEALTH_LOCK:
            if _HEALTH_INFLIGHT.get(timeout) is fut:
                del _HEALTH_INFLIGHT[timeout]


def _inventory_singleflight() -> dict:
    """Concurrent refresh=1 calls share ONE probe sweep (hardening: N callers
    must not trigger N full npx fleets)."""
    with _REFRESH_SINGLE_LOCK:
        fut = _REFRESH_INFLIGHT.get("sweep")
        if fut is None:
            fut = _REFRESH_EXECUTOR.submit(mcpdiscover.inventory, True)
            _REFRESH_INFLIGHT["sweep"] = fut
    try:
        return fut.result(timeout=120.0)
    finally:
        with _REFRESH_SINGLE_LOCK:
            if _REFRESH_INFLIGHT.get("sweep") is fut:
                del _REFRESH_INFLIGHT["sweep"]


def _mcptoon_engine() -> dict:
    """Report the mcptoon engine bridge status without importing heavy machinery."""
    try:
        version = metadata.version("mcptoon")
    except metadata.PackageNotFoundError:
        return {"available": False, "version": None}
    try:
        import mcptoon  # noqa: F401 — availability probe only
    except Exception:
        return {"available": False, "version": version}
    return {"available": True, "version": version}


class ToggleIn(BaseModel):
    server: str
    tool: str


class SkillsRemoveIn(BaseModel):
    name: str


class WatcherIn(BaseModel):
    action: str  # 'start' | 'stop'


class LaunchIn(BaseModel):
    args: list[str] | None = None
    cwd: str | None = None
    use_vault: bool = False
    aliases: dict[str, str] | None = None  # target_env_var -> provider_id (secret stays backend)
    plain_env: dict[str, str] | None = None  # non-secret env passthrough
    window: bool | None = None  # None = auto by adapter tui flag
    profile: str | None = None  # model profile name (T-067)


class ProfileIn(BaseModel):
    name: str
    base_url: str | None = None
    api_key: str | None = None  # goes straight into the OS keyring, never the JSON


class ProfileEditIn(BaseModel):
    # R46 merge semantics: a field left as None means "keep what is stored".
    # Empty strings mean "clear this field" (handled by edit_profile).
    base_url: str | None = None
    api_key: str | None = None


class VaultKeyIn(BaseModel):
    provider: str
    secret: str  # goes into the OS keychain, never to disk metadata


class PortalLoginIn(BaseModel):
    password: str


class PortalPasswordIn(BaseModel):
    current: str
    new: str


class VaultProviderIn(BaseModel):
    # R48: user-defined provider definition (no secrets here — keys go to
    # the keyring via /api/vault/keys as with every other provider)
    id: str
    display_name: str
    env_var: str
    base_url: str
    test_url: str | None = None
    auth_style: str = "bearer"
    local: bool = False


class McpImportIn(BaseModel):
    names: list[str]


class AgentModelIn(BaseModel):
    model: str | None = None  # None clears


class AdoptIn(BaseModel):
    label: str
    launch_command: list[str] | None = None


class LaunchCommandIn(BaseModel):
    command: str  # raw user string, e.g. "catpaw --workspace demo"


def create_app() -> FastAPI:
    app = FastAPI(title="ToonDeck", version=metadata.version("toondeck"))

    @app.get("/api/health")
    def health() -> dict:
        return {
            "ok": True,
            "service": "toondeck",
            "version": metadata.version("toondeck"),
            "engine": _mcptoon_engine(),
        }

    # ── R53: portal password gate (default admin123 until first login
    #    seeds the hash; TOONDECK_PORTAL_PASSWORD env overrides) ──
    from . import portal

    @app.get("/api/portal/state")
    def portal_state() -> dict:
        return portal.state()

    @app.post("/api/portal/login")
    def portal_login(payload: PortalLoginIn) -> dict:
        ok = portal.verify(payload.password)
        if ok:
            portal.ensure_sealed(payload.password)
        journal.record("portal.login", ok=ok)
        return {"ok": ok}

    @app.put("/api/portal/password")
    def portal_set_password(payload: PortalPasswordIn) -> dict:
        if not portal.verify(payload.current):
            return {"ok": False, "error": "current password is wrong"}
        r = portal.set_password(payload.new)
        if r.get("ok"):
            journal.record("portal.password", ok=True)
        return r

    # ── MCP management (thin shell over deck.engine) ──
    @app.get("/api/mcp/state")
    def mcp_state() -> dict:
        return engine.get_state()

    @app.post("/api/mcp/toggle")
    def mcp_toggle(body: ToggleIn) -> dict:
        enabled = engine.toggle(body.server, body.tool)
        return {"server": body.server, "tool": body.tool, "enabled": enabled}

    @app.post("/api/mcp/sync")
    def mcp_sync() -> dict:
        results = engine.request_sync()
        journal.record(
            "mcp.sync",
            agents=len(results),
            ok=sum(1 for x in results if isinstance(x, dict) and x.get("ok", True)),
        )
        return {"results": results}

    @app.get("/api/mcp/health")
    def mcp_health(timeout: float = 10.0) -> dict:
        # Hardening: query params are untrusted — clamp to [1, 30] so no
        # caller can out-wait the frontend's 35s abort fuse.
        clamped = min(30.0, max(1.0, float(timeout)))
        out = dict(_health_singleflight(clamped))
        out["timeout_s"] = clamped
        results = out.get("results") or []
        journal.record(
            "mcp.health",
            timeout_s=clamped,
            servers=len(results),
            ok=sum(1 for h in results if isinstance(h, dict) and h.get("ok")),
        )
        return out

    # ── R45: activity journal — the Logs page feeds on what the deck does ──
    @app.get("/api/activity")
    def activity(limit: int = 100) -> dict:
        if limit < 1:
            return {"events": []}  # honor the ask: 0 events means 0 events
        return {"events": journal.read(min(500, limit))}

    @app.get("/api/skills/state")
    def skills_state() -> dict:
        return skills.get_state()

    @app.post("/api/skills/sync")
    def skills_sync() -> dict:
        results = skills.sync_all()
        journal.record(
            "skills.sync",
            views=len(results),
            ok=sum(1 for x in results if isinstance(x, dict) and x.get("ok", True)),
        )
        return {"results": results}

    @app.post("/api/skills/sync/{name}")
    def skills_sync_one(name: str) -> dict:
        # UX-017: single-skill sync. Unknown name → 200 ok:false, same
        # deck-level error reporting contract as /api/skills/remove.
        r = skills.sync_one(name)
        journal.record("skills.sync_one", name=name, ok=bool(r.get("ok")))
        return r

    @app.get("/api/skills/doctor")
    def skills_doctor() -> dict:
        return skills.doctor()

    @app.post("/api/skills/remove")
    def skills_remove(payload: SkillsRemoveIn) -> dict:
        return skills.remove_skill(payload.name)

    @app.post("/api/skills/watcher")
    def skills_watcher_post(payload: WatcherIn) -> dict:
        return skills.watcher(payload.action)

    @app.get("/api/skills/watcher")
    def skills_watcher_get() -> dict:
        return skills.watcher("status")

    @app.get("/api/agents")
    def agents_detect() -> dict:
        return agents.detect_all()

    @app.get("/api/vault/state")
    def vault_state() -> dict:
        return vault.get_state()

    @app.post("/api/vault/providers")
    def vault_add_provider(payload: VaultProviderIn) -> dict:
        # R48: user-defined providers (merge into the catalog; secrets stay
        # in the keyring as with any other provider)
        r = vault.add_provider(payload.model_dump())
        journal.record("vault.provider_add", provider=payload.id, ok=bool(r.get("ok")))
        return r

    @app.delete("/api/vault/providers/{pid}")
    def vault_remove_provider(pid: str) -> dict:
        r = vault.remove_provider(pid)
        journal.record("vault.provider_remove", provider=pid, ok=bool(r.get("ok")))
        return r

    @app.post("/api/vault/keys")
    def vault_set_key(payload: VaultKeyIn) -> dict:
        return vault.set_key(payload.provider, payload.secret)

    @app.delete("/api/vault/keys/{provider}")
    def vault_del_key(provider: str) -> dict:
        return vault.delete_key(provider)

    @app.post("/api/vault/test/{provider}")
    def vault_test(provider: str) -> dict:
        r = vault.test(provider)
        journal.record("vault.probe", provider=provider, ok=bool(r.get("ok")))
        return r

    @app.get("/api/mcp/discover")
    def mcp_discover() -> dict:
        return mcpdiscover.discover()

    @app.get("/api/mcp/tools")
    def mcp_tools(refresh: bool = False) -> dict:
        import toondeck.deck.mcpcompat  # noqa: F401 — runtime shim must be active

        return mcpdiscover.inventory(refresh=refresh) if not refresh else _inventory_singleflight()

    @app.post("/api/mcp/import")
    def mcp_import(payload: McpImportIn) -> dict:
        return mcpdiscover.import_selected(payload.names)

    @app.get("/api/agents/models")
    def agent_models() -> dict:
        return {"models": agents.get_models(), "sources": agents.get_sources()}

    @app.put("/api/agents/{agent_id}/source")
    def agent_set_source(agent_id: str, payload: AgentModelIn) -> dict:
        return agents.set_source(agent_id, payload.model)

    @app.put("/api/agents/{agent_id}/model")
    def agent_set_model(agent_id: str, payload: AgentModelIn) -> dict:
        return agents.set_model(agent_id, payload.model)

    @app.get("/api/agents/profiles")
    def agent_profiles() -> dict:
        return {"profiles": agents.list_profiles()}

    @app.post("/api/agents/profiles")
    def agent_add_profile(payload: ProfileIn) -> dict:
        return agents.add_profile(payload.name, payload.base_url, payload.api_key)

    @app.put("/api/agents/profiles/{name}")
    def agent_edit_profile(name: str, payload: ProfileEditIn) -> dict:
        # R46: merge-edit — url-only edits keep the stored key alive (the
        # POST route replaces the whole entry and would silently sever it)
        r = agents.edit_profile(name, payload.base_url, payload.api_key)
        journal.record("profile.edit", name=name, ok=bool(r.get("ok")))
        return r

    @app.delete("/api/agents/profiles/{name}")
    def agent_del_profile(name: str) -> dict:
        return agents.remove_profile(name)

    @app.get("/api/agents/discover")
    def agents_discover() -> dict:
        return agentdiscover.discover_all()

    @app.get("/api/fleet/overview")
    def fleet_overview() -> dict:
        from .. import fleet

        return fleet.overview()

    @app.get("/api/agents/providers")
    def agent_providers() -> dict:
        return {"providers": agents.provider_catalog()}

    # N-R12: live model list + 3-second chat test per provider
    @app.get("/api/agents/providers/{name}/models/refresh")
    def agent_provider_models_refresh(name: str) -> dict:
        return agents.refresh_provider_models(name)

    @app.post("/api/agents/providers/{name}/test")
    def agent_provider_test(name: str) -> dict:
        return agents.test_provider_chat(name)

    @app.post("/api/agents/adopt")
    def agents_adopt(payload: AdoptIn) -> dict:
        r = agentdiscover.adopt(payload.label, payload.launch_command)
        journal.record(
            "agent.adopt",
            label=payload.label,
            ok=bool(r.get("ok", True)) if isinstance(r, dict) else True,
        )
        return r

    @app.post("/api/agents/{agent_id}/launch-command")
    def agent_set_launch_command(agent_id: str, payload: LaunchCommandIn) -> dict:
        # UX-B5: GUI-only agents get a user-supplied launch command
        from fastapi import HTTPException

        from ..agents import internal as agents_internal

        if agent_id not in agents_internal.load_all():
            raise HTTPException(status_code=404, detail=f"unknown agent: {agent_id}")
        parts = payload.command.split()
        if not parts:
            raise HTTPException(status_code=422, detail="empty command")
        return agentdiscover.override_launch_command(agent_id, parts)

    @app.get("/api/agents/status")
    def agents_status() -> dict:
        return agents.status_all()

    @app.get("/api/agents/{agent_id}/logs/download")
    def agent_log_download(agent_id: str) -> Response:
        r = agents.log_download(agent_id)
        return Response(
            content=r["content"],
            media_type="text/markdown; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="toondeck-{agent_id}-log.md"'
            },
        )

    @app.get("/api/agents/{agent_id}/status")
    def agent_status(agent_id: str) -> dict:
        return agents.status(agent_id)

    @app.post("/api/agents/{agent_id}/launch")
    def agent_launch(agent_id: str, payload: LaunchIn | None = None) -> dict:
        env_extra: dict[str, str] = {}
        # N5: the vault helpers now raise a typed error instead of leaking a raw
        # exception. That used to reach FastAPI as a bare 500 with no `error`
        # field — the one response shape the frontend guard cannot display, so
        # the user saw a click do nothing. Refuse the launch and say why,
        # rather than start an agent missing the key it was just asked to
        # inject; that agent would fail later with a provider-side "not
        # authenticated", which is far harder to trace back to this checkbox.
        try:
            if payload and payload.use_vault:
                env_extra.update(vault.resolve_env())
            if payload and payload.aliases:
                env_extra.update(vault.alias_env(payload.aliases))
        except vault.VaultUnavailable as e:
            return {"ok": False, "error": "keyring_unavailable", "detail": str(e)}
        if payload and payload.plain_env:
            env_extra.update(payload.plain_env)
        profile = payload.profile if payload and payload.profile else agents.get_sources().get(agent_id)
        r = agents.launch(
            agent_id,
            cwd=payload.cwd if payload else None,
            args=payload.args if payload else None,
            env_extra=env_extra or None,
            window=payload.window if payload else None,
            profile=profile,
        )
        journal.record(
            "agent.launch",
            agent=agent_id,
            ok=bool(r.get("ok", True)),
            pid=r.get("pid"),
            mode=r.get("mode"),
            profile=profile,
        )
        return r

    @app.post("/api/agents/{agent_id}/stop")
    def agent_stop(agent_id: str) -> dict:
        r = agents.stop(agent_id)
        journal.record("agent.stop", agent=agent_id, ok=bool(r.get("ok", True)))
        return r

    @app.websocket("/api/agents/{agent_id}/logs")
    async def agent_logs(ws: WebSocket, agent_id: str) -> None:
        channel = agents.log_channel(agent_id)
        if channel is None:
            await ws.close(code=4404)
            return
        await ws.accept()
        import asyncio
        import queue as qmod

        q = channel["queue"]
        try:
            snapshot = channel["snapshot"]
            proc = agents.status(agent_id)
            # N-R6: an exited WINDOW-mode agent will never produce more lines —
            # its logs live in the desktop console it was launched in. Say so
            # and end the stream instead of pretending to stream forever.
            if (
                proc.get("state") == "exited"
                and channel.get("capture_mode") == "window"
                and not snapshot
            ):
                await ws.send_text("⏹ 该 agent 以窗口模式启动，日志直接打在它自己的桌面控制台窗口里（本面板抓不到）。")
                await ws.send_text(f"⏹ 已退出 · exit code {proc.get('exit_code')}。找不到窗口？到任务栏找同名控制台窗口；关闭它即退出 agent。")
                await ws.close(code=1000)
                return
            for line in snapshot[-50:]:
                await ws.send_text(line)
            while True:
                try:
                    line = q.get_nowait()
                except qmod.Empty:
                    await asyncio.sleep(0.05)
                    continue
                await ws.send_text(line)
        except Exception:  # noqa: BLE001 — disconnect is the normal end of stream
            pass
        finally:
            agents.log_unsubscribe(agent_id, q)

    # ── R43: product landing page — a real document, NOT the SPA shell.
    # Registered before the catch-all so the SPA fallback can never swallow it.
    @app.get("/landing")
    def landing():
        target = static.landing_page()
        if target is None:
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(target, media_type="text/html")

    # ── SPA hosting (catch-all, last) ──
    @app.get("/{path:path}")
    def spa(path: str):
        # CLEAN-ROOM AUDIT 2026-09-05: /api/* is a JSON namespace. Before this
        # guard, a typo like GET /api/skills (real route: /api/skills/state)
        # fell through to the shell and answered 200 + index.html — which the
        # browser surfaces as "Unexpected token '<'" instead of a 404, sending
        # users hunting for a bug that isn't in the code they're reading.
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"error": "not_found", "path": "/" + path}, status_code=404)
        target = static.resolve(path)
        if target is None:
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(target)

    return app
