/*
UX-A3/A4 RED→GREEN: frontend never hangs on a probe; TUI window mode explains itself.

A3 (frontend resilience):
- aborts /api/mcp/health and /api/mcp/tools after 35s (backend deadline makes
  this a safety net, but the browser must never spin forever either);
- button stays retryable after a failure (no permanent "probing…" lock);
- health summary line shows ok/timeout/error counts.

A4 (TUI window mode honesty):
- /api/agents exposes adapter tui flag;
- AgentsPanel "live log" for a TUI agent shows the window-mode explainer
  instead of a silent empty xterm (the ring only records pipe launches).
*/

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AgentsPanel from "../agents/AgentsPanel";
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
  return vi.fn((url: string) => {
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
              discovered_total: 0,
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
    if (url in extra)
      return Promise.resolve({ json: () => Promise.resolve(extra[url]) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("UX-A3: probe resilience", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("health aborts after 35s, stays retryable, shows failure state", async () => {
    // shouldAdvanceTime keeps waitFor's polling alive while the 35s cap stays virtual
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const never = new Promise(() => {}); // request that never settles
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/mcp/health")) return never;
      return baseMock()(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <I18nProvider>
        <McpPanel />
      </I18nProvider>,
    );
    const btn = await screen.findByRole("button", { name: /run health check/ });
    fireEvent.click(btn);
    expect(btn).toBeDisabled(); // probing…
    await vi.advanceTimersByTimeAsync(36_000); // past the abort deadline
    expect(btn).not.toBeDisabled(); // retryable — never locked forever
    expect(await screen.findByText(/体检失败|health check failed/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/mcp/health"))).toBe(true);
  }, 15_000);

  it("health summary line counts ok/timeout/error", async () => {
    vi.stubGlobal(
      "fetch",
      baseMock({
        "/api/mcp/health": {
          checked: 3,
          results: [
            { server: "a", transport: "stdio", status: "ok", tools: 1, latency_ms: 5, error: null },
            { server: "b", transport: "stdio", status: "timeout", tools: 0, latency_ms: 9000, error: "no answer" },
            { server: "c", transport: "stdio", status: "error", tools: 0, latency_ms: 5, error: "boom" },
          ],
        },
      }),
    );
    render(
      <I18nProvider>
        <McpPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /run health check/ }));
    // R28 verdict card: ok/total up front, timeout and error called out after
    expect(await screen.findByText(/1\/3 ok/)).toBeInTheDocument();
    expect(screen.getByText(/· 1 timeout/)).toBeInTheDocument();
    expect(screen.getByText(/· 1 error/)).toBeInTheDocument();
  });
});

describe("UX-A4: TUI window-mode log explainer", () => {
  const tuiAgent = {
    agents: [
      {
        id: "codex",
        display_name: "Codex CLI",
        installed: true,
        evidence: { "exe:codex": true },
        config_paths: {},
        launch_command: ["codex"],
        tui: true,
      },
    ],
    total: 1,
    installed_count: 1,
  };

  beforeEach(() => {
    vi.stubGlobal("alert", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tui agent with a running window shows the explainer, not an empty xterm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/agents") return Promise.resolve({ json: () => Promise.resolve(tuiAgent) });
        if (url === "/api/agents/status")
          return Promise.resolve({
            json: () => Promise.resolve({ codex: { state: "running", exit_code: null, pid: 7, mode: "window" } }),
          });
        if (url === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }),
    );
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("Codex CLI");
    await userEvent.click(screen.getByRole("button", { name: /logs/i }));
    expect(
      await screen.findByText(/桌面窗口内运行|own desktop window/i),
    ).toBeInTheDocument();
  });
});
