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
    },
    {
      name: "exa",
      transport: "stdio",
      target: "node exa.js",
      env_keys: ["EXA_API_KEY"],
      header_keys: [],
      disabled_tools: ["websearch"],
    },
  ],
  server_total: 2,
  disabled_total: 1,
  config_path: "C:/Users/x/.mcptoon/config.json",
};

function mockFetch(postResponses: Record<string, unknown> = {}) {
  return vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/mcp/state") {
      return Promise.resolve({ json: () => Promise.resolve(state) });
    }
    if (url === "/api/mcp/toggle" || url === "/api/mcp/sync") {
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
});
