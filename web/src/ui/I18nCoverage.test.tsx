/*
UX-C1 RED: language switch must flip the MCP page chrome — the fleet
dashboard copy and panel strings are user-facing; hardcoded CJK literals
ignore the EN/ZH toggle. Pinned via FleetDashboard (the worst offender).
*/

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../i18n";
import FleetDashboard from "../mcp/FleetDashboard";

function LangToggle() {
  const { lang, setLang } = useI18n();
  return <button onClick={() => setLang(lang === "en" ? "zh" : "en")}>toggle</button>;
}

function baseMock() {
  return vi.fn((url: string) => {
    if (url === "/api/fleet/overview")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            mcptoon: {
              servers_total: 3,
              tools_cached: 12,
              disabled_tools: 0,
              discovered_total: 1,
              sources_scanned: 7,
              sources_breakdown: {},
              config_path: "x",
            },
            agents: { total: 7, installed: 5, cli_capable: 4 },
            skills: { total: 9, valid: 8, views_ok: 6, views_total: 6 },
          }),
      });
    if (url === "/api/mcp/tools")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            checked: 4,
            adopted_total: 3,
            discovered_total: 1,
            tools_total: 12,
            by_source: {},
            probed_at: 0,
          }),
      });
    if (url === "/api/health")
      return Promise.resolve({
        json: () => Promise.resolve({ engine: { version: "0.7.1" } }),
      });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("C1: fleet dashboard follows the language toggle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", baseMock());
  });

  it("flips the dashboard heading and big-card labels EN↔ZH", async () => {
    render(
      <I18nProvider>
        <LangToggle />
        <FleetDashboard />
      </I18nProvider>,
    );
    expect(await screen.findByText(/mcptoon fleet overview/i)).toBeInTheDocument();
    await user_click_toggle_and_expect();
  });
});

async function user_click_toggle_and_expect() {
  await import("@testing-library/user-event").then(async ({ default: userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(await screen.findByText(/mcptoon 舰队总览/)).toBeInTheDocument();
    expect(screen.getByText(/MCP 工具（全量实探）/)).toBeInTheDocument();
  });
}
