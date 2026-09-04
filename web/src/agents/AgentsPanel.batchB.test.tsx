/*
Batch-B round 2 (B3 + B5 + B6):
- B3: AgentsPanel polls /api/agents/status every 10s — only while the tab
  is visible; pausing on hidden tabs (honest polling, no battery drain).
- B5: GUI-only agents (catpaw: installed, launch_command null) get an inline
  "add launch command" form; saving POSTs /api/agents/{id}/launch-command and
  the launch button activates after reload.
- B6: provider catalog links to the Vault page; VaultPanel explains the
  relationship (catalog = quick enable, Vault = full management).
*/

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AgentsPanel from "./AgentsPanel";
import VaultPanel from "../vault/VaultPanel";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function makeMock() {
  let catpawCmd: string[] | null = null;
  let statusCalls = 0;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/agents") {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            agents: [
              {
                id: "catpaw",
                display_name: "CatPaw IDE",
                installed: true,
                evidence: { "dir:~/.catpaw": true },
                config_paths: {},
                launch_command: catpawCmd,
                tui: false,
              },
            ],
            total: 1,
            installed_count: 1,
          }),
      });
    }
    if (url === "/api/agents/status") {
      statusCalls += 1;
      return Promise.resolve({
        json: () => Promise.resolve({ catpaw: { state: "never", exit_code: null } }),
      });
    }
    if (url === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
    if (url === "/api/agents/profiles") return Promise.resolve({ json: () => Promise.resolve({ profiles: {} }) });
    if (url === "/api/agents/providers")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            providers: [
              {
                id: "deepseek",
                display_name: "DeepSeek",
                base_url: "https://api.deepseek.com/v1",
                models: ["deepseek-chat"],
                keyless: false,
                configured: true,
              },
            ],
          }),
      });
    if (url === "/api/agents/catpaw/launch-command") {
      const body = JSON.parse((init as RequestInit).body as string) as { command: string };
      catpawCmd = body.command.split(" ");
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, agent_id: "catpaw" }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
  });
  (fetchMock as unknown as { statusCalls: () => number }).statusCalls = () => statusCalls;
  return fetchMock;
}

describe("B3: visible-only status polling", () => {
  beforeEach(() => {
    setVisibility("visible");
  });
  afterEach(() => {
    setVisibility("visible");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls every 10s while visible and stops when hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = makeMock();
    vi.stubGlobal("fetch", fetchMock);
    const calls = () => (fetchMock as unknown as { statusCalls: () => number }).statusCalls();
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("CatPaw IDE");
    const baseline = calls();
    expect(baseline).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(21_000);
    expect(calls()).toBeGreaterThanOrEqual(baseline + 2); // ~10s + ~20s ticks

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    const frozen = calls();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(calls()).toBe(frozen); // no polling for hidden tabs
  }, 20_000);
});

describe("B5: catpaw launch command form", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a raw command and activates the launch button", async () => {
    const fetchMock = makeMock();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("CatPaw IDE");
    const launchBefore = screen.getByRole("button", { name: "launch" });
    expect(launchBefore).toBeDisabled(); // no command yet

    await userEvent.click(screen.getByRole("button", { name: /add launch command|添加启动命令/ }));
    const input = screen.getByTestId('catpaw-cmd-input');
    await userEvent.type(input, "catpaw --workspace demo");
    const card = screen.getByText("CatPaw IDE").closest("section") as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: /^save$|^保存$/ }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => u === "/api/agents/catpaw/launch-command" && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as unknown as RequestInit).body as string)).toEqual({
        command: "catpaw --workspace demo",
      });
    });
    expect(await screen.findByRole("button", { name: "launch" })).toBeEnabled();
  });
});

describe("B6: vault cross-links", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("provider catalog links to the Vault page", async () => {
    vi.stubGlobal("fetch", makeMock());
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("CatPaw IDE");
    const link = await screen.findByRole("link", { name: /manage & test in vault|在 vault 页管理\/测试/i });
    expect(link).toHaveAttribute("href", "#/vault");
  });

  it("VaultPanel explains catalog vs vault relationship", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/vault/state")
          return Promise.resolve({ json: () => Promise.resolve({ providers: [] }) });
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }),
    );
    render(
      <I18nProvider>
        <VaultPanel />
      </I18nProvider>,
    );
    expect(
      await screen.findByText(/quick enabling|快捷启用/),
    ).toBeInTheDocument();
    expect(screen.getByText(/full management|全量管理/)).toBeInTheDocument();
  });
});
