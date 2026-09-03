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

function mockFor(
  adoptedTotal: number,
  toolTotal: number,
  opts?: { agents?: AgentRowLite[]; skillsTotal?: number; skillsFail?: boolean },
) {
  const agents: AgentRowLite[] =
    opts?.agents ?? [{ id: "codex", display_name: "Codex CLI", installed: true, evidence: {} }];
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
      return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (url === "/api/skills/state") {
      if (opts?.skillsFail) return Promise.reject(new Error("skills fetch failed"));
      const total = opts?.skillsTotal ?? 12;
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            source: "C:/x/.toondeck/skills",
            exists: true,
            skills: [],
            counts: { total, valid: total },
          }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

type AgentRowLite = {
  id: string;
  display_name: string;
  installed: boolean;
  evidence: Record<string, boolean>;
};

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

  it("servers but no installed agent → launch guidance takes over (R40)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFor(3, 40, { agents: [{ id: "codex", display_name: "Codex CLI", installed: false, evidence: {} }] }),
    );
    render(<App />);
    expect(await screen.findByText(/put an agent on the deck/i)).toBeInTheDocument();
    // launch path beats the skills path in the decision tree
    expect(screen.queryByText(/no skills on deck yet/i)).toBeNull();
    const link = screen.getByRole("link", { name: /agents/i });
    expect(link).toHaveAttribute("href", "#/agents");
  });

  it("fleet + agent but zero skills → skills import guidance (R40)", async () => {
    vi.stubGlobal("fetch", mockFor(3, 40, { skillsTotal: 0 }));
    render(<App />);
    expect(await screen.findByText(/no skills on deck yet/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /skills page/i });
    expect(link).toHaveAttribute("href", "#/skills");
    expect(screen.queryByText(/undefined/i)).toBeNull();
  });

  it("skills API failing hides the skills branch instead of guessing (R40)", async () => {
    vi.stubGlobal("fetch", mockFor(3, 40, { skillsFail: true }));
    render(<App />);
    // fleet is healthy → falls through to the fleet-numbers step-2 card
    expect(await screen.findByText(/3 MCP servers and 40 tools/)).toBeInTheDocument();
    expect(screen.queryByText(/no skills on deck yet/i)).toBeNull();
  });
});
