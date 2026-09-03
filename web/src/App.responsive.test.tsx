/*
R31: responsive contract.

The sidebar was w-56 shrink-0 with NO breakpoint classes — a narrow window
lost 224px permanently and the panels squeezed into the rest. Contract:
- below md: a horizontal, scrollable tab bar (role=navigation, all 7 tabs)
- at md+: the desktop sidebar only (hidden md:flex)
- main content padding adapts (p-4 md:p-8)
- toasts span the bottom edge on phones (left-4 right-4 sm:left-auto)
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
    if (url === "/api/fleet/overview")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            mcptoon: { servers_total: 0, tools_cached: 0, disabled_tools: 0, discovered_total: 0, sources_scanned: 0, sources_breakdown: {}, config_path: "x" },
            agents: { total: 0, installed: 0, cli_capable: 0 },
            skills: { total: 0, valid: 0, views_ok: 0, views_total: 0 },
          }),
      });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("R31: responsive shell", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
    vi.stubGlobal("fetch", baseFetch());
  });

  it("renders a mobile tab bar with all 7 tabs", async () => {
    render(<App />);
    const mob = await screen.findByRole("navigation", { name: /tabs/i });
    const links = within(mob).getAllByRole("link");
    expect(links.length).toBe(7);
  });

  it("keeps the desktop sidebar md-only", async () => {
    render(<App />);
    const aside = await screen.findByRole("complementary");
    expect(aside.className).toMatch(/hidden md:flex/);
  });

  it("main content padding adapts on narrow screens", async () => {
    render(<App />);
    const main = await screen.findByRole("main", { hidden: true });
    expect(main.className).toMatch(/p-4 md:p-8/);
  });
});
