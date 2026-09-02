import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import McpPanel from "./McpPanel";

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
    {
      name: "exa",
      transport: "stdio",
      target: "node exa.js",
      env_keys: ["EXA_API_KEY"],
      header_keys: [],
      disabled_tools: ["websearch"],
      tool_total: 0,
      cache_age_s: null,
    },
  ],
  server_total: 2,
  disabled_total: 1,
  config_path: "C:/Users/x/.mcptoon/config.json",
  token_savings: {
    method: "len//4",
    tool_total: 0,
    full_json_tokens: 0,
    slim_tokens: 0,
    saved_pct: 0,
  },
};

function mockFetch(postResponses: Record<string, unknown> = {}) {
  return vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/mcp/state") {
      return Promise.resolve({ json: () => Promise.resolve(state) });
    }
    if (url === "/api/fleet/overview") {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            mcptoon: {
              servers_total: 2,
              tools_cached: 0,
              disabled_tools: 1,
              discovered_total: 0,
              sources_scanned: 7,
              sources_breakdown: {},
              config_path: "x",
            },
            agents: { total: 7, installed: 7, cli_capable: 6 },
            skills: { total: 0, valid: 0, views_ok: 0, views_total: 6 },
          }),
      });
    }
    if (url === "/api/health") {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            ok: true,
            service: "toondeck",
            version: "0.1.0",
            engine: { available: true, version: "0.7.1" },
          }),
      });
    }
    if (url === "/api/mcp/toggle" || url === "/api/mcp/sync" || url === "/api/mcp/health") {
      const key = new URL(url, "http://x").pathname;
      return Promise.resolve({
        json: () => Promise.resolve(key in postResponses ? postResponses[key] : {}),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("McpPanel", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
  });

  it("renders server cards from engine state, secrets as key names only", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<App />);
    expect(await screen.findByText("fetch")).toBeInTheDocument();
    expect(screen.getByText("exa")).toBeInTheDocument();
    expect(screen.getByText(/EXA_API_KEY/)).toBeInTheDocument();
    expect(screen.getAllByText("stdio")).toHaveLength(2);
  });

  it("re-enables a disabled tool via the toggle endpoint", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<McpPanel />);
    const chip = await screen.findByRole("button", { name: /websearch/ });
    await userEvent.click(chip);
    await waitFor(() => {
      const called = fetchMock.mock.calls.find(([u]) => u === "/api/mcp/toggle");
      expect(called).toBeTruthy();
      expect((called![1] as RequestInit).body).toBe(
        JSON.stringify({ server: "exa", tool: "websearch" }),
      );
    });
  });

  it("sync button posts to the sync endpoint", async () => {
    const fetchMock = mockFetch({ "/api/mcp/sync": { results: [{ agent: "claude-code", ok: true }] } });
    vi.stubGlobal("fetch", fetchMock);
    render(<McpPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /sync all agents/ }));
    expect(await screen.findByText("claude-code")).toBeInTheDocument();
  });

  it("health check renders per-server verdicts", async () => {
    const fetchMock = mockFetch({
      "/api/mcp/health": {
        checked: 2,
        results: [
          { server: "fetch", transport: "stdio", status: "ok", tools: 3, latency_ms: 12, error: null },
          { server: "exa", transport: "stdio", status: "timeout", tools: 0, latency_ms: 10000, error: "timeout" },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<McpPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /run health check/ }));
    expect(await screen.findByText(/probed statuses below/)).toBeInTheDocument();
    expect(screen.getAllByText("timeout").length).toBeGreaterThanOrEqual(1);
  });

  it("token savings card shows the honest math when cache is populated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/mcp/state") {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                ...state,
                token_savings: {
                  method: "len//4",
                  tool_total: 12,
                  full_json_tokens: 4800,
                  slim_tokens: 96,
                  saved_pct: 98,
                },
              }),
          });
        }
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }),
    );
    render(<McpPanel />);
    expect(await screen.findByText("4,800")).toBeInTheDocument();
    expect(await screen.findByText("-98%")).toBeInTheDocument();
  });
});
