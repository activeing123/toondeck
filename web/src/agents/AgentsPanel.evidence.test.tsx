/*
 * N-round2 follow-up: inside the folded "detection details" the chips were
 * raw engineer tokens ("exe:claude", struck-through when missing) — a
 * newcomer cannot parse them. Contract: chips speak ("✓ 命令 claude"),
 * a one-line legend explains ✓/✗, and no raw prefix leaks.
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
    evidence: { "exe:claude": true, "dir:~/.claude": true, "cmd:cla": false },
    config_paths: {},
    skills_dir: "~/.claude/skills",
    launch_command: ["claude"],
    env_config_support: false,
    tui: true,
  },
];

const doctor = { providers: [] };

function mockFetch() {
  return vi.fn((url: string) => {
    if (String(url).startsWith("/api/agents"))
      return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (String(url).startsWith("/api/vault/providers"))
      return Promise.resolve({ json: () => Promise.resolve(doctor) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N: evidence chips speak human, not engineer", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", mockFetch());
  });

  it("opened details show ✓/✗ + kind words, never raw exe:/dir:/cmd: prefixes", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const details = await screen.findByTestId("evidence-claude-code");
    await userEvent.click(details.querySelector("summary")!);
    expect(details).toHaveTextContent("✓ 命令 claude");
    expect(details).toHaveTextContent("✓ 目录");
    expect(details).toHaveTextContent("✗ 命令 cla");
    expect(details.textContent).not.toMatch(/exe:|dir:|cmd:/);
  });

  it("a legend explains what ✓ and ✗ mean for the installed badge", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const details = await screen.findByTestId("evidence-claude-code");
    await userEvent.click(details.querySelector("summary")!);
    expect(details).toHaveTextContent(/检测到/);
    expect(details).toHaveTextContent(/已装好/);
  });
});
