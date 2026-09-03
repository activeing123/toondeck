/*
R29: keyboard accessibility.

1. The active nav link carries aria-current="page" (screen readers announce
   "current page" instead of leaving users to guess from styling alone).
2. Digits 1–7 jump straight to the matching nav tab (Gmail-style single-key
   nav) — but ONLY when the user is not typing in an input/textarea.
3. After a route change, focus moves to the page container so keyboard and
   screen-reader users land at the top of the new content instead of staying
   on the link they just activated.
*/

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    if (url === "/api/agents")
      return Promise.resolve({ json: () => Promise.resolve({ agents: [], total: 0, installed_count: 0 }) });
    if (url === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve({}) });
    if (url === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
    if (url === "/api/vault/state")
      return Promise.resolve({ json: () => Promise.resolve({ providers: [] }) });
    if (url === "/api/skills")
      return Promise.resolve({
        json: () => Promise.resolve({ skills: [], categories: [], total: 0, valid: 0 }),
      });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("R29: keyboard navigation", () => {
  beforeEach(() => {
    window.location.hash = "";
    vi.stubGlobal("fetch", baseFetch());
  });

  it("marks the active nav link with aria-current=page", async () => {
    window.location.hash = "#/mcp"; // Shell routes carry the sidebar
    render(<App />);
    await waitFor(() => {
      // R31: both the desktop sidebar and the mobile tab bar render the link
      const links = screen.getAllByRole("link", { name: /mcp/i });
      expect(links.length).toBeGreaterThanOrEqual(1);
      for (const link of links) expect(link).toHaveAttribute("aria-current", "page");
    });
  });

  it("digit keys jump to the matching tab", async () => {
    render(<App />);
    await screen.findByText(/step 1|next step/i); // landing rendered
    fireEvent.keyDown(window, { key: "2" });
    await waitFor(() => expect(window.location.hash).toBe("#/mcp"));
    await waitFor(() => {
      for (const link of screen.getAllByRole("link", { name: /mcp/i }))
        expect(link).toHaveAttribute("aria-current", "page");
    });
  });

  it("digit keys are ignored while typing in an input", async () => {
    render(<App />);
    window.location.hash = "#/vault";
    await screen.findAllByRole("link", { name: /vault/i }); // desktop + mobile copies
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "2" });
    expect(window.location.hash).toBe("#/vault");
    input.remove();
  });

  it("route change moves focus to the page container", async () => {
    render(<App />);
    await screen.findByText(/step 1|next step/i); // landing rendered
    fireEvent.keyDown(window, { key: "6" }); // vault
    await waitFor(() => expect(window.location.hash).toBe("#/vault"));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-route-focus")).toBe("true"),
    );
  });
});
