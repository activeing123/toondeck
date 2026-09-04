/*
 * R41 ⑥ — FleetDashboard numbers are clickable: a stat you can see is a
 * stat you want to manage. Skills card -> #/skills, CLI agents card ->
 * #/agents, MCP tools card -> scrolls to the tools browser on this page.
 * The mixed "capabilities" hero stays static (no single destination).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FleetDashboard from "./FleetDashboard";

const overview = {
  mcptoon: {
    servers_total: 5,
    tools_cached: 40,
    disabled_tools: 0,
    discovered_total: 6,
    sources_scanned: 3,
    sources_breakdown: { claude: ["fetch"] },
    config_path: "C:/x/config.json",
  },
  agents: { total: 7, installed: 7, cli_capable: 6 },
  skills: { total: 301, valid: 301, views_ok: 6, views_total: 6 },
};

const inventory = {
  checked: 5,
  adopted_total: 5,
  discovered_total: 6,
  tools_total: 40,
  by_source: { claude: 40 },
  probed_at: 1,
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/fleet/overview")
      return Promise.resolve({ json: () => Promise.resolve(overview) });
    if (url === "/api/mcp/tools")
      return Promise.resolve({ json: () => Promise.resolve(inventory) });
    if (url === "/api/health")
      return Promise.resolve({ json: () => Promise.resolve({ engine: { version: "0.7.4" } }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("FleetDashboard clickable stats (R41)", () => {
  let scrollSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
    scrollSpy = vi.fn();
    // jsdom does not implement scrollIntoView
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
    document.getElementById("server-table")?.remove();
    // R52: the scroll target is the unified ServerTable (ToolsBrowser died
    // in R47 — the old anchor was a dead no-op on the real page)
    const anchor = document.createElement("div");
    anchor.id = "server-table";
    document.body.appendChild(anchor);
  });

  it("skills stat links to #/skills", async () => {
    render(<FleetDashboard />);
    // R52: the capabilities total is also a link — filter by destination
    // explicitly (name matches both cards)
    const links = await screen.findAllByRole("link", { name: /skills/i });
    expect(links.some((l) => l.getAttribute("href") === "#/skills")).toBe(true);
  });

  it("CLI agents stat links to #/agents", async () => {
    render(<FleetDashboard />);
    const links = await screen.findAllByRole("link", { name: /CLI agents/i });
    expect(links.some((l) => l.getAttribute("href") === "#/agents")).toBe(true);
  });

  it("R52: the capabilities total is a link to the deck home hub, not static", async () => {
    render(<FleetDashboard />);
    const total = await screen.findByRole("link", { name: /capabilities|能力/i });
    expect(total).toHaveAttribute("href", "#/");
  });

  it("MCP tools stat scrolls to the unified server table", async () => {
    render(<FleetDashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /MCP tools/i }));
    expect(scrollSpy).toHaveBeenCalled();
  });
});
