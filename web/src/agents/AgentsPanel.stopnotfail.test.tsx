/*
 * N-R5: stopping an agent is not a failure — but the card then flashed
 * "⚠ 已退出 code 1" plus the self-fix loop (download md, hand to any agent),
 * telling a novice their own click broke something. Contract:
 * - after a successful stop, no self-fix hint
 * - exit_code 0 (clean exit from inside the agent) also shows no hint
 * - a crash (exited, nonzero, not user-stopped) still shows the hint
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/agents") return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (u === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve(status) });
    if (u === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {}, sources: {} }) });
    if (u === "/api/agents/profiles") return Promise.resolve({ json: () => Promise.resolve({ profiles: {} }) });
    if (u === "/api/agents/providers") return Promise.resolve({ json: () => Promise.resolve({ providers: [] }) });
    if (init?.method === "POST" && u.endsWith("/stop"))
      return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

async function renderWith(status: Record<string, unknown>) {
  vi.stubGlobal("fetch", makeFetch(status));
  render(
    <I18nProvider>
      <AgentsPanel />
    </I18nProvider>,
  );
  await screen.findByText("Codex CLI");
}

describe("N-R5: stopping is not failing", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("a user stop leaves no self-fix hint", async () => {
    await renderWith({ codex: { state: "running", exit_code: null, pid: 7, logs: [] } });
    await userEvent.click(screen.getByRole("button", { name: "停止" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "启动" })).toBeInTheDocument());
    expect(screen.queryByTestId("selffix-hint-codex")).toBeNull();
  });

  it("a clean exit (code 0) shows no hint", async () => {
    await renderWith({ codex: { state: "exited", exit_code: 0, logs: [] } });
    expect(screen.queryByTestId("selffix-hint-codex")).toBeNull();
  });

  it("a real crash still shows the hint", async () => {
    await renderWith({ codex: { state: "exited", exit_code: 1, logs: [] } });
    expect(await screen.findByTestId("selffix-hint-codex")).toBeInTheDocument();
  });
});
