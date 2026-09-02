"""R19 RED: slow WS consumers silently lose log lines.

_pump drops lines with `except queue.Full: pass` — the UI then shows a
broken-tail transcript that LOOKS complete. The ToonDeck honesty principle
(the whole point of the UX audit) says: dropping under backpressure is a
fine policy, but it must leave a visible trace in the stream.
"""

import io
import queue

import toondeck.deck.agents.internal.manager as mgr


class _FakeProc:
    poll = staticmethod(lambda: None)
    stdout = io.StringIO("")
    stderr = None


def _agent() -> mgr.AgentProcess:
    return mgr.AgentProcess("t1", _FakeProc())


def test_slow_consumer_gets_a_visible_skip_marker():
    agent = _agent()
    q = agent.subscribe()
    for i in range(1000):  # fill the subscriber queue to the brim
        q.put_nowait(f"old-{i}")
    agent._pump(io.StringIO("new-1\nnew-2\nnew-3\n"))  # sync pump: 3 fresh lines
    lines = []
    while True:
        try:
            lines.append(q.get_nowait())
        except queue.Empty:
            break
    markers = [ln for ln in lines if "skip" in ln.lower()]
    assert markers, (
        "3 lines were dropped with no trace in the stream — the UI shows a "
        "gap that claims to be complete"
    )


def test_fast_consumer_loses_nothing_and_sees_no_marker():
    agent = _agent()
    q = agent.subscribe()
    agent._pump(io.StringIO("a\nb\nc\n"))
    lines = []
    while True:
        try:
            lines.append(q.get_nowait())
        except queue.Empty:
            break
    assert lines == ["a", "b", "c"]
    assert not any("skip" in ln.lower() for ln in lines)
