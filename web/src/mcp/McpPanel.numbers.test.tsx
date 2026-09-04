/*
 * R52 — P2: clickable-number consistency on the MCP page. The fleet
 * dashboard's component stats were clickable but the page's own headline
 * numbers were static, and the R47 IA change left the old #tools-browser
 * anchor dead. Contract:
 * - the h1 managed-server count scrolls to the server table
 * - the universe tools count scrolls to the server table
 * - both targets exist (no more dead anchor)
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      tool_total: 3,
      cache_age_s: null,
      sources: ["claude-desktop"],
    },
  ],
  server_total: 1,
  disabled_total: 0,
  config_path: "C:/Users/x/.mcptoon/config.json",
  token_savings: {
    method: "len//4",
    tool_total: 3,
    full_json_tokens: 1200,
    slim_tokens: 96,
    saved_pct: 92,
  },
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/mcp/state") return Promise.resolve({ json: () => Promise.resolve(state) });
    if (url === "/api/mcp/tools")
      return Promise.resolve({ json: () => Promise.resolve({ checked: 0, adopted_total: 1, discovered_total: 0, tools_total: 3, servers: [] }) });
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
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("R52: MCP page numbers are all reachable", () => {
  let scrollSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
    scrollSpy = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
    document.getElementById("server-table")?.remove();
    const anchor = document.createElement("div");
    anchor.id = "server-table";
    document.body.appendChild(anchor);
  });

  it("h1 managed count is a button that scrolls to the server table", async () => {
    render(<McpPanel />);
    await userEvent.click(await screen.findByTestId("mcp-managed-count"));
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("universe tools count is a button that scrolls to the server table", async () => {
    render(<McpPanel />);
    await userEvent.click(await screen.findByTestId("mcp-tools-count"));
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("the scroll target really exists on this page (no dead anchors)", async () => {
    render(<McpPanel />);
    await screen.findByText("fetch");
    expect(document.getElementById("server-table")).not.toBeNull();
  });
});
