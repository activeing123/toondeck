/*
R28: the health verdict card must surface the trust facts the backend already
returns: how many servers answered, the total wall time, and the timeout cap
that was used. Latency per server is color-graded: green when it answered
well under the cap, amber as it approaches it. A card that just says "4 ok"
without the time budget makes users re-run the probe to be sure.
*/

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import McpPanel from "./McpPanel";
import { HealthVerdict } from "./HealthVerdict";

const baseMock = () =>
  vi.fn((url: string) => {
    if (url === "/api/mcp/state")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            servers: [],
            server_total: 0,
            disabled_total: 0,
            token_savings: {
              method: "len//4",
              tool_total: 0,
              full_json_tokens: 0,
              slim_tokens: 0,
              saved_pct: 0,
            },
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

describe("HealthVerdict", () => {
  it("renders ok count, wall time and the timeout cap", () => {
    render(
      <I18nProvider>
        <HealthVerdict
          results={[
            { server: "a", transport: "stdio", status: "ok", tools: 5, latency_ms: 120, error: null },
            { server: "b", transport: "stdio", status: "timeout", tools: 0, latency_ms: 10_000, error: "deadline" },
            { server: "c", transport: "stdio", status: "ok", tools: 3, latency_ms: 300, error: null },
          ]}
          wallMs={1820}
          timeoutS={10}
          onRerun={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
    expect(screen.getByText(/1\.8s/)).toBeInTheDocument();
    expect(screen.getByText(/≤10s/)).toBeInTheDocument();
  });

  it("grades latency near the cap as amber", () => {
    render(
      <I18nProvider>
        <HealthVerdict
          results={[
            { server: "fast", transport: "stdio", status: "ok", tools: 1, latency_ms: 100, error: null },
            { server: "slow", transport: "stdio", status: "ok", tools: 1, latency_ms: 9_000, error: null },
          ]}
          wallMs={9100}
          timeoutS={10}
          onRerun={() => {}}
        />
      </I18nProvider>,
    );
    const latRow = (name: string) => name;
    void latRow;
    expect(screen.getByText(/· 100ms/)).toBeInTheDocument();
    expect(screen.getByText(/· 100ms/).className).toMatch(/led-ok/);
    expect(screen.getByText(/· 9\.0s/).className).toMatch(/led-warn/);
  });
});

describe("McpPanel wires the verdict after a probe", () => {
  beforeEach(() => {
    window.location.hash = "#/mcp";
  });

  it("health check shows the trust card with wall time and cap", async () => {
    const fetchMock = baseMock();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/mcp/health")
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              checked: 2,
              timeout_s: 10,
              results: [
                { server: "a", transport: "stdio", status: "ok", tools: 5, latency_ms: 150, error: null },
                { server: "b", transport: "stdio", status: "ok", tools: 2, latency_ms: 250, error: null },
              ],
            }),
        });
      return baseMock()(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <I18nProvider>
        <McpPanel />
      </I18nProvider>,
    );
    await userEventClickHealth();
    expect(await screen.findByText(/2\/2 ok/)).toBeInTheDocument();
    expect(screen.getByText(/≤10s/)).toBeInTheDocument();
  });
});

async function userEventClickHealth() {
  const userEvent = (await import("@testing-library/user-event")).default;
  const btn = await screen.findByRole("button", { name: /run health check/i });
  await userEvent.click(btn);
}
