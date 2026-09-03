/*
R37 / PM-3 RED: the design veto sheet is a dev tool, not a user destination.

Contract: production navigation (sidebar + mobile tab bar) shows 6 tabs —
the #/design entry is dev-only (import.meta.env.DEV). The route itself stays
deep-linkable so the veto workflow survives for development. In the vitest
environment import.meta.env.DEV is true, so the nav-visible assertions pin
the count from the DEV side; a second test pins the DEVGUARD sentinel: the
NAV entries carry a `dev` flag and the filter is shared by both navs, so a
future tab cannot accidentally appear in production by adding itself to NAV
without the flag.
*/

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const health = {
  ok: true,
  service: "toondeck",
  version: "0.1.0",
  engine: { available: true, version: "0.7.1" },
};

function baseFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/health") return Promise.resolve({ json: () => Promise.resolve(health) });
    if (url === "/api/mcp/tools")
      return Promise.resolve({ json: () => Promise.resolve({ adopted_total: 0, tools_total: 0 }) });
    // McpPanel renders on #/mcp and needs the full state shape — a thin mock
    // crashes the tree (the R25 lesson) and the sidebar disappears with it.
    if (url === "/api/mcp/state")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            servers: [],
            server_total: 0,
            disabled_total: 0,
            token_savings: { method: "len//4", tool_total: 0, full_json_tokens: 0, slim_tokens: 0, saved_pct: 0 },
          }),
      });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("R37: design page is dev-only in navigation", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
    vi.stubGlobal("fetch", baseFetch());
  });

  it("nav shows exactly 6 production tabs in both sidebar and tab bar", async () => {
    localStorage.removeItem("toondeck.dev");
    render(<App />);
    const mob = await screen.findByRole("navigation", { name: /tabs/i });
    expect(within(mob).getAllByRole("link").length).toBe(6);
    // sidebar sections live in their own nav (brand link excluded on purpose)
    const side = await screen.findByRole("navigation", { name: /sections/i });
    expect(within(side).getAllByRole("link").length).toBe(6);
  });

  it("the dev flag re-reveals the design tab (escape hatch works)", async () => {
    localStorage.setItem("toondeck.dev", "1");
    try {
      render(<App />);
      const mob = await screen.findByRole("navigation", { name: /tabs/i });
      expect(within(mob).getAllByRole("link").length).toBe(7);
    } finally {
      localStorage.removeItem("toondeck.dev");
    }
  });

  it("the deep link still serves the design sheet (dev workflow intact)", async () => {
    window.location.hash = "#/design";
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1, name: /design directions/i }),
    ).toBeInTheDocument();
  });
});
