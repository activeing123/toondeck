"""deck.api.app — FastAPI app factory (thin shell; logic lives in deck.* modules).

Route order matters: real API routes register BEFORE the SPA catch-all.
"""

from __future__ import annotations

from importlib import metadata

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .. import engine
from .. import skills
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

    # ── SPA hosting (catch-all, last) ──
    @app.get("/{path:path}")
    def spa(path: str):
        target = static.resolve(path)
        if target is None:
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(target)

    return app
