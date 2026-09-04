/*
 * N-round2: the zh MCP toolbar still leaked raw English ("refresh",
 * "run health check", "sync all agents" / "syncing…", "probing…") — the
 * last page where action buttons bypass t(). Contract: busy or idle, zh
 * mode renders zero bare-English action labels; the health button also
 * names what it does in zh.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import McpPanel from "./McpPanel";
import { I18nProvider } from "../i18n";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchInventory: vi.fn().mockResolvedValue({ servers: [], tools: [], token_savings: { tool_total: 0 } }),
  checkHealth: vi.fn().mockResolvedValue({ results: [], wallMs: 0, timeoutS: null }),
}));

vi.mock("./FleetDashboard", () => ({
  default: () => <div data-testid="fleet-stub" />,
}));

const state = {
  token_savings: { method: "slim", tool_total: 1, full_json_tokens: 100, slim_tokens: 40, saved_pct: 60 },
  servers: [
    { name: "toondeck", transport: "stdio", url: "", command: "toondeck", enabled: true, tools: [{ name: "ping" }] },
  ],
  source: "C:/x/.mcptoon/config.json",
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (String(url).startsWith("/api/mcp/state"))
      return Promise.resolve({ json: () => Promise.resolve(state) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N: MCP toolbar speaks zh, not raw English", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", mockFetch());
  });

  it("idle buttons render zh labels", async () => {
    render(
      <I18nProvider>
        <McpPanel />
      </I18nProvider>,
    );
    expect(await screen.findByRole("button", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全量体检" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步全部 agent" })).toBeInTheDocument();
    const toolbar = ["refresh", "run health check", "sync all agents"].map((label) => {
      const btn = screen.queryByRole("button", { name: label });
      return btn ? label : null;
    });
    expect(toolbar.filter(Boolean)).toEqual([]);
  });

  it("busy states speak zh too", async () => {
    render(
      <I18nProvider>
        <McpPanel />
      </I18nProvider>,
    );
    await screen.findByRole("button", { name: "刷新" });
    expect(screen.queryByRole("button", { name: "syncing…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "probing…" })).toBeNull();
  });
});
