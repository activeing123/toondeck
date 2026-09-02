/*
R21 RED: LogTerminal has NO reconnect — a backend daemon restart (routine
takeover!) leaves the panel dead with "stream closed" until the user pokes
the UI. Extract a testable stream helper: capped exponential backoff, reset
on successful open, and no retry on 4404 (agent unknown — retrying would
be noise about a fact, not a failure).
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogStream } from "./logStream";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static lastCode: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(code = 1000) {
    this.closed = true;
    FakeWebSocket.lastCode = code;
    queueMicrotask(() => this.onclose?.({ code }));
  }

  emit(line: string) {
    this.onmessage?.({ data: line });
  }
}

const lines: string[] = [];
const statuses: string[] = [];

function makeStream(agentId = "codex") {
  return createLogStream(agentId, {
    onLine: (l) => lines.push(l),
    onStatus: (s) => statuses.push(s),
  });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.lastCode = null;
  lines.length = 0;
  statuses.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logStream reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconnects with capped backoff when the socket drops", () => {
    const stream = makeStream();
    const first = FakeWebSocket.instances[0];
    first.onclose?.({ code: 1006 }); // abnormal drop
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances.length).toBe(2); // 1st retry after 500ms
    FakeWebSocket.instances[1].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1_000);
    expect(FakeWebSocket.instances.length).toBe(3); // 2nd retry after 1s
    FakeWebSocket.instances[2].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(2_000);
    expect(FakeWebSocket.instances.length).toBe(4); // 3rd retry after 2s
    FakeWebSocket.instances[3].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(4_000);
    FakeWebSocket.instances[4].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(5_000);
    FakeWebSocket.instances[5].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(10_000);
    // cap: the 6th retry still fired 5s later, no faster, no runaway
    expect(FakeWebSocket.instances.length).toBe(7);
    stream.close();
  });

  it("resets the backoff after a successful open", () => {
    const stream = makeStream();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(500); // fresh start, not deep in the ladder
    expect(FakeWebSocket.instances.length).toBe(2);
    stream.close();
  });

  it("does not retry a 4404 (agent unknown) — it is a fact, not a failure", () => {
    const stream = makeStream("ghost");
    FakeWebSocket.instances[0].onclose?.({ code: 4404 });
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(statuses).toContain("unknown-agent");
    stream.close();
  });

  it("close() stops everything, even mid-backoff", () => {
    const stream = makeStream();
    FakeWebSocket.instances[0].onclose?.({ code: 1006 });
    stream.close();
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it("delivers lines verbatim", () => {
    const stream = makeStream();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.emit("⚠ log line skipped — consumer too slow");
    ws.emit("step 42 done");
    expect(lines).toEqual([
      "⚠ log line skipped — consumer too slow",
      "step 42 done",
    ]);
    stream.close();
  });
});
