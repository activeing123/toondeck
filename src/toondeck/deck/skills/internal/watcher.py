"""Source watcher — a daemon thread that reconciles views on source changes.

watchfiles watches the source dir; any change batch (debounced) triggers
reconcile.run(). Stop is cooperative via threading.Event — watch() honors it
and exits promptly. One global watcher per process (v0.1 semantics).
"""

from __future__ import annotations

import threading
import time

from . import reconcile
from . import source_dir

_lock = threading.Lock()
_active: "SourceWatcher | None" = None


class SourceWatcher:
    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.events = 0
        self.last_actions: list[str] = []
        self.last_ts: str | None = None
        self.error: str | None = None

    @property
    def running(self) -> bool:
        return self.thread is not None and self.thread.is_alive()

    def _loop(self) -> None:
        from watchfiles import watch

        src = source_dir()
        try:
            for changes in watch(
                str(src), stop_event=self.stop_event, debounce=400, step=100
            ):
                if self.stop_event.is_set():
                    break
                time.sleep(1.0)  # let editor bursts settle
                self.events += 1
                results = reconcile.run()
                self.last_actions = [a for r in results for a in r["actions"]]
                self.last_ts = time.strftime("%Y-%m-%dT%H:%M:%S")
                if self.stop_event.is_set():
                    break
        except Exception as e:  # noqa: BLE001 — daemon must never crash the process
            self.error = str(e)

    def start(self) -> None:
        # watchfiles raises on a nonexistent path — a fresh tmp home (tests)
        # or a never-yet-created skills dir would kill the thread before any
        # event arrives. Create it (idempotent) so the watcher survives.
        try:
            source_dir().mkdir(parents=True, exist_ok=True)
        except OSError:
            pass  # genuinely unwritable — let watch() surface the real error
        self.thread = threading.Thread(target=self._loop, name="toondeck-watcher", daemon=True)
        self.thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=timeout)
        self.thread = None


def watcher(action: str) -> dict:
    """Public seam: watcher('start' | 'stop' | 'status')."""
    global _active
    with _lock:
        if action == "start":
            if _active is not None and _active.running:
                return {"ok": True, "running": True, "note": "already running"}
            if _active is not None:
                _active.stop(timeout=1.0)  # reap a dead thread's remains
            _active = SourceWatcher()
            _active.start()
            return {"ok": True, "running": _active.running}
        if action == "stop":
            if _active is not None:
                _active.stop()
            return {"ok": True, "running": False}
        if action == "status":
            if _active is None:
                return {"ok": True, "running": False, "events": 0,
                        "last_actions": [], "last_sync_ts": None}
            return {
                "ok": True,
                "running": _active.running,
                "events": _active.events,
                "last_actions": _active.last_actions,
                "last_sync_ts": _active.last_ts,
                "error": _active.error,
            }
        return {"ok": False, "error": f"unknown action: {action}"}
