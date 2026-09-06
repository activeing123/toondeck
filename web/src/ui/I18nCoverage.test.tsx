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
    localStorage.removeItem("toondeck.lang"); // tests must not inherit each other's saved language
  });

  it("flips the dashboard heading and big-card labels EN↔ZH", async () => {
    render(
      <I18nProvider>
        <LangToggle />
        <FleetDashboard />
      </I18nProvider>,
    );
    // N-R14 / U1-②: the heading dropped "fleet" on both sides — 舰队 on the
    // Chinese, and the warship word itself on the English.
    expect(await screen.findByText(/mcptoon capabilities/i)).toBeInTheDocument();
    await user_click_toggle_and_expect();
  });

  it("P0-1 sentinel: <html lang> follows the toggle (screen-reader pronunciation)", async () => {
    const { waitFor } = await import("@testing-library/react");
    render(
      <I18nProvider>
        <LangToggle />
      </I18nProvider>,
    );
    document.documentElement.lang = "en";
    await import("@testing-library/user-event").then(async ({ default: userEvent }) => {
      await userEvent.click(screen.getByRole("button", { name: "toggle" }));
      await waitFor(() => expect(document.documentElement.lang).toBe("zh"));
      await userEvent.click(screen.getByRole("button", { name: "toggle" }));
      await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    });
  });
});

async function user_click_toggle_and_expect() {
  await import("@testing-library/user-event").then(async ({ default: userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: "toggle" }));
    // N-R14 / U1-②: 舰队→能力, 实探→探测 (one action, one Chinese word)
    expect(await screen.findByText(/mcptoon 能力总览/)).toBeInTheDocument();
    expect(screen.getByText(/MCP 工具（全量探测）/)).toBeInTheDocument();
  });
}
