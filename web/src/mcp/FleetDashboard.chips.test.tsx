/*
 * N-round2 novice audit: the source chips count tools PER SOURCE while the
 * hero headline counts UNIQUE tools — a newcomer adds 9+4+4=17 and cannot
 * reconcile it with "13 MCP tools". Contract: when the sums disagree, a
 * one-line zh note explains the difference; when they match, no note.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FleetDashboard from "./FleetDashboard";
import { I18nProvider } from "../i18n";

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

function mockFetch(bySource: Record<string, number>, toolsTotal: number) {
  return vi.fn((url: string) => {
    if (url === "/api/fleet/overview")
      return Promise.resolve({ json: () => Promise.resolve(overview) });
    if (url === "/api/mcp/tools")
      return Promise.resolve({
        json: () => Promise.resolve({ checked: 5, adopted_total: 5, discovered_total: 6, tools_total: toolsTotal, by_source: bySource, probed_at: 1 }),
      });
    if (url === "/api/health")
      return Promise.resolve({ json: () => Promise.resolve({ engine: { version: "0.7.4" } }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

function renderDash(bySource: Record<string, number>, toolsTotal: number) {
  vi.stubGlobal("fetch", mockFetch(bySource, toolsTotal));
  return render(
    <I18nProvider>
      <FleetDashboard />
    </I18nProvider>,
  );
}

describe("N: source chips vs unique-tool total reconciliation", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("shows a dedup note when chip counts sum above the unique total", async () => {
    renderDash({ toondeck: 9, cursor: 4, windsurf: 4 }, 13);
    const note = await screen.findByTestId("by-source-note");
    expect(note).toHaveTextContent(/去重/);
  });

  it("shows no note when the sums already agree", async () => {
    renderDash({ toondeck: 13 }, 13);
    await screen.findByTestId("fleet-dashboard");
    expect(screen.queryByTestId("by-source-note")).toBeNull();
  });
});
