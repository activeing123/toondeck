"""deck.api.app — FastAPI app factory (thin shell; logic lives in deck.* modules)."""

from __future__ import annotations

from importlib import metadata

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse

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

    @app.get("/{path:path}")
    def spa(path: str):
        target = static.resolve(path)
        if target is None:
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(target)

    return app
