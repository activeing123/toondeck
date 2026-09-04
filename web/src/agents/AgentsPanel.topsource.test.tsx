/*
 * N-R13 (user feedback): "这一页上面看不到自定义模型" — the add-custom
 * entry lives in the provider card BELOW 11 agent cards, invisible from
 * the top. Contract: the bulk-model bar (top of page) carries its own
 * "＋ 添加自定义模型源" button opening the same dialog, plus a jump link
 * to the provider section below.
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

function makeFetch() {
  return vi.fn((url: string) => {
    const u = String(url);
    if (u === "/api/agents") return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (u === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve({}) });
    if (u === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {}, sources: {} }) });
    if (u === "/api/agents/profiles") return Promise.resolve({ json: () => Promise.resolve({ profiles: {} }) });
    if (u === "/api/agents/providers") return Promise.resolve({ json: () => Promise.resolve({ providers: [] }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N-R13: custom model source is reachable from the top", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", makeFetch());
  });

  it("bulk bar has its own add-custom-source button that opens the dialog", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const btn = await screen.findByTestId("bulk-add-source");
    await userEvent.click(btn);
    const dlg = await screen.findByRole("dialog");
    expect(dlg.textContent).toMatch(/自定义源|custom source/);
  });

  it("offers a jump link to the provider section below", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    expect(await screen.findByTestId("goto-providers")).toBeInTheDocument();
    expect(document.querySelector("[data-testid=provider-section]")).not.toBeNull();
  });
});
