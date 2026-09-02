"""R17 RED: probe subprocess concurrency is unbounded.

One thread per server is fine; one *npx child process* per server is not —
npx cold starts fork their own node tree, so a big fleet spawns dozens of
children at once (CPU/handle bomb that makes even healthy probes time out
under contention). The cap is 8 slots; everything beyond waits for a slot
until its deadline and gets an honest timeout verdict.
"""

import time

import pytest

import toondeck.deck.mcpcompat  # noqa: F401 — apply the Windows shim to the REAL
# MCPClient class BEFORE any test swaps the module attr for a fake, or _apply()
# crashes trying to wrap FakeClient._stdio_request (R17 lesson: shim-then-swap).


class FakeClient:
    """Stands in for mcptoon.client.MCPClient; tracks live-instance peak."""

    _live = 0

    def __init__(self, **kw):
        type(self)._live += 1
        self.peak = peak_ref[0]
        peak_ref[0] = max(peak_ref[0], type(self)._live)
        time.sleep(0.2)

    def initialize(self):
        pass

    def list_tools(self):
        return [{"name": "t", "description": "d"}]

    def close(self):
        type(self)._live -= 1


peak_ref = [0]


@pytest.fixture(autouse=True)
def _reset_peak():
    peak_ref[0] = 0
    FakeClient._live = 0
    yield


def _twelve_servers():
    return {f"srv{i}": {"command": "python", "args": ["-c", "pass"]} for i in range(12)}


def test_health_probe_concurrency_bounded(monkeypatch):
    import mcptoon.config as mcfg
    import mcptoon.client as mclient
    import toondeck.deck.engine._internal as ei

    servers = _twelve_servers()
    monkeypatch.setattr(mcfg, "list_servers", lambda: sorted(servers))
    monkeypatch.setattr(mcfg, "get_server_config", lambda n: servers[n])
    monkeypatch.setattr(mclient, "MCPClient", FakeClient)

    results = ei.check_all_legacy(timeout=5.0)
    assert len(results) == 12
    assert all(r["status"] == "ok" for r in results), results
    assert peak_ref[0] <= 8, (
        f"peak concurrent probe children = {peak_ref[0]} (cap should be 8) — "
        "a big fleet would spawn an npx bomb"
    )


def test_inventory_probe_concurrency_bounded(monkeypatch):
    import mcptoon.client as mclient
    import toondeck.deck.mcpdiscover as md

    monkeypatch.setattr(mclient, "MCPClient", FakeClient)
    jobs = [(n, cfg) for n, cfg in _twelve_servers().items()]

    results = md._run_probes(jobs, timeout=5.0)
    assert len(results) == 12
    assert all(r["status"] == "ok" for r in results), results
    assert peak_ref[0] <= 8, (
        f"peak concurrent inventory children = {peak_ref[0]} — unbounded"
    )


def test_probe_slot_wait_becomes_honest_timeout(monkeypatch):
    """A server that cannot get a slot before the deadline gets a timeout
    verdict mentioning the cap — never a hang, never a fake ok."""
    import mcptoon.config as mcfg
    import mcptoon.client as mclient
    import toondeck.deck.engine._internal as ei

    class SlowClient(FakeClient):
        def __init__(self, **kw):
            super().__init__(**kw)
            time.sleep(0)  # no extra

    # 30 servers, 0.15s each, cap 8 → the tail must wait ~2 batches
    servers = {f"s{i}": {"command": "python", "args": ["-c", "pass"]} for i in range(30)}
    monkeypatch.setattr(mcfg, "list_servers", lambda: sorted(servers))
    monkeypatch.setattr(mcfg, "get_server_config", lambda n: servers[n])
    monkeypatch.setattr(mclient, "MCPClient", FakeClient)

    t0 = time.time()
    results = ei.check_all_legacy(timeout=5.0)
    wall = time.time() - t0
    assert len(results) == 30
    assert all(r["status"] == "ok" for r in results)
    # 30 probes / 8 slots ≈ 4 waves × 0.2s ≈ 0.8s+ — serialized but bounded
    assert 0.7 < wall < 4.0, f"30 probes took {wall:.1f}s — slotting not working"
    assert peak_ref[0] <= 8
