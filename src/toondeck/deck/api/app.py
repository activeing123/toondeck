"""deck.api.app — FastAPI app factory (thin shell; logic lives in deck.* modules).

Route order matters: real API routes register BEFORE the SPA catch-all.
"""

from __future__ import annotations

from importlib import metadata

from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .. import agentdiscover
from .. import agents
from .. import engine
from .. import mcpdiscover
from .. import skills
from .. import vault
from .. import mcpcompat  # noqa: F401 — Windows stdio .cmd shim for mcptoon (T-064)
from . import static


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


class VaultKeyIn(BaseModel):
    provider: str
    secret: str


class McpImportIn(BaseModel):
    names: list[str]


class AgentModelIn(BaseModel):
    model: str | None = None  # None clears


class AdoptIn(BaseModel):
    label: str
    launch_command: list[str] | None = None


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
        return {"results": engine.request_sync()}

    @app.get("/api/mcp/health")
    def mcp_health(timeout: float = 10.0) -> dict:
        return engine.check_health(timeout=timeout)

    @app.get("/api/skills/state")
    def skills_state() -> dict:
        return skills.get_state()

    @app.post("/api/skills/sync")
    def skills_sync() -> dict:
        return {"results": skills.sync_all()}

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

    @app.post("/api/vault/keys")
    def vault_set_key(payload: VaultKeyIn) -> dict:
        return vault.set_key(payload.provider, payload.secret)

    @app.delete("/api/vault/keys/{provider}")
    def vault_del_key(provider: str) -> dict:
        return vault.delete_key(provider)

    @app.post("/api/vault/test/{provider}")
    def vault_test(provider: str) -> dict:
        return vault.test(provider)

    @app.get("/api/mcp/discover")
    def mcp_discover() -> dict:
        return mcpdiscover.discover()

    @app.post("/api/mcp/import")
    def mcp_import(payload: McpImportIn) -> dict:
        return mcpdiscover.import_selected(payload.names)

    @app.get("/api/agents/models")
    def agent_models() -> dict:
        return {"models": agents.get_models()}

    @app.put("/api/agents/{agent_id}/model")
    def agent_set_model(agent_id: str, payload: AgentModelIn) -> dict:
        return agents.set_model(agent_id, payload.model)

    @app.get("/api/agents/discover")
    def agents_discover() -> dict:
        return agentdiscover.discover_all()

    @app.post("/api/agents/adopt")
    def agents_adopt(payload: AdoptIn) -> dict:
        return agentdiscover.adopt(payload.label, payload.launch_command)

    @app.get("/api/agents/status")
    def agents_status() -> dict:
        return agents.status_all()

    @app.get("/api/agents/{agent_id}/status")
    def agent_status(agent_id: str) -> dict:
        return agents.status(agent_id)

    @app.post("/api/agents/{agent_id}/launch")
    def agent_launch(agent_id: str, payload: LaunchIn | None = None) -> dict:
        env_extra: dict[str, str] = {}
        if payload and payload.use_vault:
            env_extra.update(vault.resolve_env())
        if payload and payload.aliases:
            env_extra.update(vault.alias_env(payload.aliases))
        if payload and payload.plain_env:
            env_extra.update(payload.plain_env)
        return agents.launch(
            agent_id,
            cwd=payload.cwd if payload else None,
            args=payload.args if payload else None,
            env_extra=env_extra or None,
        )

    @app.post("/api/agents/{agent_id}/stop")
    def agent_stop(agent_id: str) -> dict:
        return agents.stop(agent_id)

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
            for line in channel["snapshot"][-50:]:
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

    # ── SPA hosting (catch-all, last) ──
    @app.get("/{path:path}")
    def spa(path: str):
        target = static.resolve(path)
        if target is None:
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(target)

    return app
