/*
UX-D1: Console first-screen onboarding — the landing page tells the user what
to do FIRST. Two honest branches:
- 0 MCP servers configured  → "step 1: discover & adopt on the MCP page"
- servers already configured → "step 2: launch an agent on the Agents page"

R25 bugfix pin: the card used to read /api/mcp/state, which has no top-level
tool count — the landing page interpolated "undefined tools". The card now
consumes /api/mcp/tools (the real inventory) and MUST render the numbers,
never the string "undefined".
*/

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const health = {
  ok: true,
  service: "toondeck",
  version: "0.1.0",
  engine: { available: true, version: "0.7.1" },
};

function mockFor(adoptedTotal: number, toolTotal: number) {
  return vi.fn((url: string) => {
    if (url === "/api/health")
      return Promise.resolve({ json: () => Promise.resolve(health) });
    if (url === "/api/mcp/tools")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            adopted_total: adoptedTotal,
            tools_total: toolTotal,
            checked: adoptedTotal,
          }),
      });
    if (url === "/api/agents")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            agents: [
              { id: "codex", display_name: "Codex CLI", installed: true, evidence: {} },
            ],
          }),
      });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("D1: console onboarding card", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("a brand-new machine (0 servers) gets pointed at MCP discovery", async () => {
    vi.stubGlobal("fetch", mockFor(0, 0));
    render(<App />);
    expect(await screen.findByText(/step 1/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /mcp/i });
    expect(link).toHaveAttribute("href", "#/mcp");
    expect(link.textContent).toMatch(/discover|去 MCP 页/);
    // honest zero: no undefined, no fabricated fleet
    expect(screen.queryByText(/undefined/i)).toBeNull();
  });

  it("a configured machine renders REAL fleet numbers and points at agent launch", async () => {
    vi.stubGlobal("fetch", mockFor(3, 40));
    render(<App />);
    expect(await screen.findByText(/3 MCP servers and 40 tools/)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).toBeNull();
    const link = screen.getByRole("link", { name: /agents/i });
    expect(link).toHaveAttribute("href", "#/agents");
  });
});
