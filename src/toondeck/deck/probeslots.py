"""deck.probeslots — bounded concurrency for probe subprocesses.

One thread per server is cheap; one *npx child process* per server is not —
npx cold starts fork their own node tree, so a big fleet spawning all probes
at once is a CPU/handle bomb that makes even healthy servers time out under
contention. A sweep shares ProbeSlots: at most `limit` probe children live
concurrently; a thread that cannot get a slot before the sweep deadline
writes an honest timeout verdict instead of waiting forever.

Thread-safety: one instance per sweep; sweeps of the same kind are already
singleflight at the API layer, so no cross-sweep sharing occurs.
"""

from __future__ import annotations

import threading
import time

PROBE_CAP = 8  # concurrent probe child processes per sweep


class ProbeSlots:
    def __init__(self, limit: int = PROBE_CAP) -> None:
        self._sem = threading.Semaphore(limit)
        self._lock = threading.Lock()
        self._deadline = 0.0

    def begin_sweep(self, timeout: float) -> None:
        with self._lock:
            self._deadline = time.time() + timeout + 2.0

    def acquire(self, timeout: float) -> bool:
        """Wait for a probe slot, but never past the sweep deadline."""
        budget = max(0.0, self._deadline - time.time())
        return self._sem.acquire(timeout=budget)

    def release(self) -> None:
        self._sem.release()
