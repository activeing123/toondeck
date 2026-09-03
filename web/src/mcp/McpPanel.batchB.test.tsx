/*
Batch-B RED (B1 + B2 + B4):
- B1: "adopt all" — one click imports every fresh candidate, no per-checkbox
  ritual; result message reflects the honest count.
- B2: the dashboard "重新全量探测" button merges into a status refresh —
  McpPanel refresh triggers FleetDashboard reload too (no duplicate buttons).
- B4: "sync all agents" gets a confirm dialog naming the blast radius —
  window.confirm; aborting leaves state untouched.
*/

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import McpPanel from "./McpPanel";
import DiscoverPanel from "./DiscoverPanel";
import { I18nProvider } from "../i18n";

const state = {
  servers: [
    {
      name: "fetch",
      transport: "stdio",
      target: "npx -y mcp-fetch",
      env_keys: [],
      header_keys: [],
      disabled_tools: [],
      tool_total: 0,
      cache_age_s: null,
    },
  ],
  server_total: 1,
  disabled_total: 0,
  config_path: "C:/Users/x/.mcptoon/config.json",
  token_savings: {
    method: "len//4",
    tool_total: 0,
    full_json_tokens: 0,
    slim_tokens: 0,
    saved_pct: 0,
  },
};

function baseMock(extra: Record<string, unknown> = {}) {
  return vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/mcp/state")
      return Promise.resolve({ json: () => Promise.resolve(state) });
    if (url === "/api/fleet/overview")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            mcptoon: {
              servers_total: 1,
              tools_cached: 0,
              disabled_tools: 0,
              discovered_total: 2,
              sources_scanned: 7,
              sources_breakdown: {},
              config_path: "x",
            },
            agents: { total: 7, installed: 7, cli_capable: 6 },
            skills: { total: 0, valid: 0, views_ok: 0, views_total: 6 },
          }),
      });
    if (url === "/api/health")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            ok: true,
            service: "toondeck",
            version: "0.1.0",
            engine: { available: true, version: "0.7.1" },
          }),
      });
    if (url === "/api/mcp/discover")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            candidates: [
              { name: "alpha", transport: "stdio", command: "node", args: ["a.js"], sources: ["cursor"] },
              { name: "beta", transport: "http", url: "http://x/mcp", sources: ["codex"] },
            ],
            sources_scanned: 2,
            total: 2,
          }),
      });
    if (url in extra)
      return Promise.resolve({ json: () => Promise.resolve(extra[url]) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("B1: adopt all", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
  });
  afterEach?.(() => undefined);

  it("imports every fresh candidate with one click", async () => {
    const fetchMock = baseMock({
      "/api/mcp/import": { imported: 2, skipped: 0 },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <I18nProvider>
        <DiscoverPanel configuredNames={[]} onImported={() => {}} />
      </I18nProvider>,
    );
    await screen.findByText("alpha");
    await userEvent.click(screen.getByRole("button", { name: /adopt all|一键收编/ }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => u === "/api/mcp/import" && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as unknown as RequestInit).body as string)).toEqual({
        names: ["alpha", "beta"],
      });
    });
    expect(await screen.findByText(/\+2 · 0 skipped/)).toBeInTheDocument();
  });

  it("adopt-all posts every candidate even when some are already picked", async () => {
    const fetchMock = baseMock({ "/api/mcp/import": { imported: 2, skipped: 0 } });
    vi.stubGlobal("fetch", fetchMock);
    render(<I18nProvider>
        <DiscoverPanel configuredNames={[]} onImported={() => {}} />
      </I18nProvider>);
    await screen.findByText("alpha");
    await userEvent.click(screen.getByRole("checkbox", { name: /alpha/i }));
    await userEvent.click(screen.getByRole("button", { name: /adopt all|一键收编/ }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => u === "/api/mcp/import" && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(JSON.parse((call![1] as unknown as RequestInit).body as string).names).toHaveLength(2);
    });
  });
});

describe("B2: merge probe button into refresh", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
  });

  it("refresh reloads both state and fleet inventory (no duplicate probe button)", async () => {
    const fetchMock = baseMock();
    vi.stubGlobal("fetch", fetchMock);
    render(<McpPanel />);
    await screen.findByText("fetch");
    const probeBtn = screen.queryByRole("button", { name: /重新全量探测/ });
    expect(probeBtn).toBeNull(); // B2: gone — merged into the top refresh
    // R26: raw keys now resolve to real English, so the DiscoverPanel's own
    // "refresh" also matches — click the header's refresh (the first one)
    const refreshBtn = screen.getAllByRole("button", { name: /^refresh$/i })[0];
    fireEvent.click(refreshBtn);
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/mcp/tools")).length).toBeGreaterThan(0);
    });
    expect(fetchMock.mock.calls.filter(([u]) => String(u) === "/api/mcp/state").length).toBeGreaterThanOrEqual(2);
  });
});

describe("B4: sync confirm", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
  });

  it("sync asks for confirmation and aborts cleanly on cancel", async () => {
    const fetchMock = baseMock();
    vi.stubGlobal("fetch", fetchMock);
    render(<McpPanel />);
    await screen.findByText("fetch");
    await userEvent.click(screen.getAllByRole("button", { name: /sync all agents/i })[0]);
    // R26: the blast-radius dialog is in-app now, not window.confirm
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/mcp/sync")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sync proceeds and renders per-agent results on confirm", async () => {
    const fetchMock = baseMock({
      "/api/mcp/sync": { results: [{ agent: "claude-code", ok: true }] },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<McpPanel />);
    await screen.findByText("fetch");
    await userEvent.click(screen.getAllByRole("button", { name: /sync all agents/i })[0]);
    await screen.findByRole("dialog");
    // DEBUG
    console.log("BUTTONS:", screen.queryAllByRole("button").map((b) => JSON.stringify(b.textContent)).join(" | "));
    console.log("DIALOG HTML:", document.querySelector('[role="dialog"]')?.innerHTML?.slice(0, 400));
    await userEvent.click(screen.getByRole("button", { name: /overwrite & sync now/i }));
    expect(await screen.findByText("claude-code")).toBeInTheDocument();
  });
});
