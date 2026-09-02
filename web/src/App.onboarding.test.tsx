/*
UX-D1 RED: Console first-screen onboarding — the landing page must tell a
new user what to do FIRST instead of dumping numbers. Two honest branches:
- 0 MCP servers configured  → "step 1: discover & adopt on the MCP page"
- servers already configured → "step 2: launch an agent on the Agents page"
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

function mockFor(serverTotal: number, toolTotal: number) {
  return vi.fn((url: string) => {
    if (url === "/api/health")
      return Promise.resolve({ json: () => Promise.resolve(health) });
    if (url === "/api/mcp/state")
      return Promise.resolve({
        json: () =>
          Promise.resolve({ server_total: serverTotal, tool_total: toolTotal }),
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
  });

  it("a configured machine (servers ready) gets pointed at agent launch", async () => {
    vi.stubGlobal("fetch", mockFor(3, 40));
    render(<App />);
    expect(await screen.findByText(/step 2|next step/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /agents/i });
    expect(link).toHaveAttribute("href", "#/agents");
  });
});
