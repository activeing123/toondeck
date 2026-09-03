/*
R32 RED→GREEN: the log terminal gains a filter box.

A read-only xterm is great for watching and useless for finding. Contract:
typing a query swaps the live view for a filtered line view (case-insensitive)
with an honest "N of M lines" count; the live stream keeps running beneath
the hood, and clearing the query returns to the live terminal untouched.
xterm itself is mocked — jsdom has no canvas; the logic under test is the
buffering + filter view wiring.
*/

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LogTerminal from "./LogTerminal";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    writeln = vi.fn();
    open = vi.fn();
    dispose = vi.fn();
    options: unknown;
    constructor(opts?: unknown) {
      this.options = opts;
    }
  },
}));

class FakeWS {
  static instances: FakeWS[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(_url: string) {
    FakeWS.instances.push(this);
  }
}

function emit(...lines: string[]) {
  const ws = FakeWS.instances.at(-1)!;
  ws.onopen?.();
  for (const line of lines) ws.onmessage?.({ data: line });
}

describe("R32: log filter view", () => {
  it("filters buffered lines and reports an honest count", async () => {
    FakeWS.instances = [];
    vi.stubGlobal("WebSocket", FakeWS);
    render(<LogTerminal agentId="t1" filterable />);

    await waitFor(() => expect(FakeWS.instances.length).toBeGreaterThan(0));
    emit("INFO boot ok", "ERROR disk full", "INFO health ok", "error: retry scheduled");

    const input = await screen.findByPlaceholderText(/filter lines|过滤日志行/i);
    await userEvent.type(input, "error");

    const view = await screen.findByTestId("log-filter-view");
    expect(view.textContent).toContain("ERROR disk full");
    expect(view.textContent).toContain("error: retry scheduled");
    expect(view.textContent).not.toContain("INFO boot ok");
    expect(await screen.findByText(/2 matching lines|2 行匹配/)).toBeInTheDocument();

    // clearing returns to the live view
    await userEvent.clear(input);
    expect(screen.queryByTestId("log-filter-view")).toBeNull();
  });

  it("says when nothing matches instead of an empty box", async () => {
    FakeWS.instances = [];
    vi.stubGlobal("WebSocket", FakeWS);
    render(<LogTerminal agentId="t2" filterable />);
    await waitFor(() => expect(FakeWS.instances.length).toBeGreaterThan(0));
    emit("INFO boot ok");

    const input = await screen.findByPlaceholderText(/filter lines|过滤日志行/i);
    await userEvent.type(input, "quantum");
    expect(await screen.findByText(/no lines match|无匹配行/)).toBeInTheDocument();
  });
});
