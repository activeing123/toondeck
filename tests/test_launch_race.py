"""R23 RED: Manager.launch is check-then-act without a lock.

Two concurrent launches (a double-click = two near-simultaneous POSTs on
FastAPI's per-request threadpool) both pass the `old.running()` gate and the
second Popen overwrites the first — an orphan process the deck can never
stop (window mode = a stray desktop window). launch/stop must serialize.
"""

import time
from concurrent.futures import ThreadPoolExecutor

import toondeck.deck.agents.internal.manager as mgr


class SlowProc:
    """Stands in for Popen; slow constructor widens the TOCTOU window."""

    _next = iter(range(1000, 2000))

    def __init__(self, cmd, **kw):
        self.pid = next(SlowProc._next)
        self.stdout = None  # pipe-mode pumps must tolerate a fake without streams
        self.stderr = None
        time.sleep(0.08)
        self._terminated = False

    def poll(self):
        return None  # always "running"

    def wait(self, timeout=None):
        return 0

    def terminate(self):
        self._terminated = True

    def kill(self):
        self._terminated = True


def test_double_launch_yields_one_process_not_an_orphan(monkeypatch):
    monkeypatch.setattr(mgr.subprocess, "Popen", SlowProc)
    m = mgr.Manager()
    adapter = {"launch_command": ["python", "-c", "pass"]}

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: m.launch("a1", adapter), range(2)))

    oks = [r for r in results if r["ok"]]
    assert len(oks) == 1, f"both launches succeeded — orphan created: {results}"
    assert any("already running" in (r.get("error") or "") for r in results), results
    assert len(m.procs) == 1, "procs dict must hold exactly one entry for a1"


def test_double_stop_is_idempotent(monkeypatch):
    monkeypatch.setattr(mgr.subprocess, "Popen", SlowProc)
    m = mgr.Manager()
    adapter = {"launch_command": ["python", "-c", "pass"]}
    m.launch("a1", adapter)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: m.stop("a1"), range(2)))

    assert all(r["ok"] for r in results), results
