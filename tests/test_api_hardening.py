"""UX-hardening RED: query params are attacker-controlled, so clamp them.

- /api/mcp/health?timeout=99999 must not bypass the probe deadline: the API
  clamps timeout to [1, 30] seconds (frontend aborts at 35s — a verdict must
  always beat the browser fuse).
- /api/mcp/tools?refresh=1 has no singleflight: N concurrent refreshes each
  probe the whole fleet (npx cold starts × N). inventory() now dedupes
  concurrent refreshes behind one in-flight future.
"""

from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    from mcptoon import config as mcptoon_config

    monkeypatch.setenv("MCPTOON_CONFIG_FILE", str(tmp_path / "config.json"))
    monkeypatch.setattr(mcptoon_config, "CONFIG_FILE", tmp_path / "config.json")
    monkeypatch.setenv("TOONDECK_HOME", str(tmp_path))
    mcptoon_config.save_config({})  # empty fleet — fast, no probes needed
    from toondeck.deck.api.app import create_app

    yield TestClient(create_app())


def test_health_timeout_is_clamped(client):
    r = client.get("/api/mcp/health", params={"timeout": 99_999})
    assert r.status_code == 200
    # a 99_999s request must not have been honored — clamped to ≤30
    assert r.json()["timeout_s"] <= 30


def test_tools_refresh_singleflight(client, monkeypatch):
    import toondeck.deck.mcpdiscover as md

    # keep discovery hermetic — the real machine's agent configs would leak
    # servers into the sweep (same lesson as the R5 inventory fixture)
    import toondeck.deck.mcpdiscover.internal as mdi

    monkeypatch.setattr(mdi, "source_files", lambda home=None: [])

    probe_calls = {"n": 0}
    real_run = md._run_probes

    def counting_run(jobs, timeout):
        probe_calls["n"] += 1
        import time as _t

        _t.sleep(0.3)  # make the refresh window wide enough to overlap
        return real_run(jobs, timeout)

    monkeypatch.setattr(md, "_run_probes", counting_run)
    md._bust_inventory_cache()

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(
            pool.map(
                lambda _: client.get("/api/mcp/tools", params={"refresh": 1}).json(),
                range(5),
            )
        )
    assert all(r["checked"] == 0 for r in results)  # empty fleet, all served
    assert probe_calls["n"] == 1, (
        f"5 concurrent refreshes produced {probe_calls['n']} full probe sweeps "
        "— singleflight missing"
    )


def test_health_concurrent_singleflight(client, monkeypatch):
    """Same hardening as the inventory sweep, for /api/mcp/health: N identical
    concurrent calls must share ONE probe sweep (35s-abort retries can stack)."""
    import toondeck.deck.engine as eng

    calls = {"n": 0}
    real = eng.check_health

    def counting(timeout):
        calls["n"] += 1
        import time as _t

        _t.sleep(0.4)  # wide overlap window
        return real(timeout=timeout)

    monkeypatch.setattr(eng, "check_health", counting)

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(
            pool.map(lambda _: client.get("/api/mcp/health").json(), range(4))
        )
    assert all(r["timeout_s"] == 10.0 for r in results)
    assert calls["n"] == 1, (
        f"4 concurrent health calls produced {calls['n']} sweeps — singleflight missing"
    )
