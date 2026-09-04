/*
 * N-R2 (user feedback): "新增模型很隐蔽" — the provider drawer is a collapsed
 * <details> below the cards; "新增来源" lives inside it. Contract:
 * - the provider section is a persistent card with a visible count badge
 *   (0 enabled → amber badge, so the novice sees the setup is incomplete)
 * - "添加模型来源" button sits in the section header, always clickable,
 *   opening the ProviderDialog without unfolding anything
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPanel from "./AgentsPanel";
import { I18nProvider } from "../i18n";

const agents = [
  {
    id: "claude-code",
    display_name: "Claude Code",
    installed: true,
    evidence: { "exe:claude": true },
    config_paths: {},
    skills_dir: "~/.claude/skills",
    launch_command: ["claude"],
    env_config_support: false,
    tui: true,
  },
];

function makeFetch(providers: unknown[]) {
  return vi.fn((url: string) => {
    const u = String(url);
    if (u === "/api/agents") return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (u === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve({}) });
    if (u === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {}, sources: {} }) });
    if (u === "/api/agents/profiles") return Promise.resolve({ json: () => Promise.resolve({ profiles: {} }) });
    if (u === "/api/agents/providers") return Promise.resolve({ json: () => Promise.resolve({ providers }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

const catalog = [
  { id: "anthropic", display_name: "Anthropic", base_url: "https://api.anthropic.com", models: ["claude-sonnet-4-5"], keyless: false, configured: false },
  { id: "deepseek", display_name: "DeepSeek", base_url: "https://api.deepseek.com", models: ["deepseek-chat"], keyless: false, configured: false },
];

describe("N-R2: model sources are visible, not buried", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("renders a persistent provider section with an amber zero badge and a header add button", async () => {
    vi.stubGlobal("fetch", makeFetch(catalog));
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const badge = await screen.findByTestId("provider-badge");
    expect(badge.textContent).toMatch(/0\s*\/\s*2/);
    expect(badge.className).toMatch(/amber|text-amber|led-warn/);
    // header-level add button — no unfolding required
    const add = screen.getByTestId("provider-add-header");
    await userEvent.click(add);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("keeps provider rows readable without a fold", async () => {
    vi.stubGlobal("fetch", makeFetch(catalog));
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    // both provider rows visible without expanding anything
    expect(await screen.findByTestId("provider-enable-anthropic")).toBeInTheDocument();
    expect(screen.getByTestId("provider-enable-deepseek")).toBeInTheDocument();
  });
});
