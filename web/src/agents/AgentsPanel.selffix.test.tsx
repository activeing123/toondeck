/*
 * N-R6: when an agent exits non-zero, the card shows "已退出 · code 1" and
 * a "⬇ 下载 md 报告" button — but nothing tells a newcomer the mcptoon
 * self-heal loop: download the report, hand it to any agent, it fixes
 * itself. Contract: an exited agent's card carries that one-line hint.
 */
import { render, screen } from "@testing-library/react";
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

function mockFetch(state: Record<string, unknown>) {
  return vi.fn((url: string) => {
    if (String(url).startsWith("/api/agents/status"))
      return Promise.resolve({ json: () => Promise.resolve(state) });
    if (String(url).startsWith("/api/agents"))
      return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N-R6: exited agent points at the self-heal loop", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("an exited card shows the download-and-hand-off hint", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "claude-code": { state: "exited", exit_code: 1 } }),
    );
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const hint = await screen.findByTestId("selffix-hint-claude-code");
    expect(hint).toHaveTextContent(/md 报告/);
    expect(hint).toHaveTextContent(/丢给|交给/);
    expect(hint.querySelector("a")).toHaveAttribute("href", "/api/agents/claude-code/logs/download");
  });

  it("a never-launched card shows no hint (nothing to heal yet)", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText(/已装好 · 点启动就行/);
    expect(screen.queryByTestId("selffix-hint-claude-code")).toBeNull();
  });
});
