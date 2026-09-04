/*
 * N-R3 (user ask: 按小白思路思考): a never-launched agent card shows the
 * same three buttons as a running one — 停止/日志 disabled-but-visible reads
 * as "am I supposed to click this?" Contract:
 * - a never-launched card shows only 启动 (plus model/source controls);
 *   停止 and 日志 buttons are simply not rendered
 * - once launched (running/exited) both appear again
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPanel from "./AgentsPanel";
import { I18nProvider } from "../i18n";

const agents = [
  {
    id: "codex",
    display_name: "Codex CLI",
    installed: true,
    evidence: { "exe:codex": true },
    config_paths: {},
    skills_dir: "~/.codex/skills",
    launch_command: ["codex"],
    env_config_support: false,
    tui: true,
  },
];

function makeFetch(status: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const u = String(url);
    if (u === "/api/agents") return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (u === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve(status) });
    if (u === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {}, sources: {} }) });
    if (u === "/api/agents/profiles") return Promise.resolve({ json: () => Promise.resolve({ profiles: {} }) });
    if (u === "/api/agents/providers") return Promise.resolve({ json: () => Promise.resolve({ providers: [] }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N-R3: never-launched cards only offer what makes sense", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("hides 停止 and 日志 while the agent has never launched", async () => {
    vi.stubGlobal("fetch", makeFetch({}));
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启动" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停止" })).toBeNull();
    expect(screen.queryByRole("button", { name: "日志" })).toBeNull();
  });

  it("shows 停止 and 日志 once the agent is running", async () => {
    vi.stubGlobal("fetch", makeFetch({ codex: { state: "running", exit_code: null, pid: 4242, logs: [] } }));
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    expect(await screen.findByRole("button", { name: "停止" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日志" })).toBeInTheDocument();
  });
});
