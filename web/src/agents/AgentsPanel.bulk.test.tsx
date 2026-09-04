/*
 * N-R11 (user feedback): on the agents page the model settings lived inside
 * a collapsed <details> ABOVE the cards — users never scrolled/found it, and
 * there was no way to set one model for every agent. Contract:
 * 1. agent cards render BEFORE the provider drawer (DOM order)
 * 2. a bulk bar takes ANY model string (custom models pass through verbatim)
 *    and, after an explicit confirm, PUTs it to every agent
 */
import { render, screen, waitFor } from "@testing-library/react";
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
  {
    id: "codex",
    display_name: "Codex",
    installed: true,
    evidence: { "exe:codex": true },
    config_paths: {},
    skills_dir: "~/.codex/skills",
    launch_command: ["codex"],
    env_config_support: false,
    tui: true,
  },
];

function makeFetch() {
  const puts: { url: string; body: { model: string } }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/agents") return Promise.resolve({ json: () => Promise.resolve({ agents }) });
    if (u === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve({}) });
    if (u === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {}, sources: {} }) });
    if (u === "/api/agents/profiles") return Promise.resolve({ json: () => Promise.resolve({ profiles: {} }) });
    if (u === "/api/agents/providers") return Promise.resolve({ json: () => Promise.resolve({ providers: [] }) });
    if (init?.method === "PUT" && u.endsWith("/model")) {
      puts.push({ url: u, body: JSON.parse(String(init.body)) as { model: string } });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
  return { fn, puts };
}

describe("N-R11: model setup for novices, one shot for all agents", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("agent cards come before the provider drawer", async () => {
    const { fn } = makeFetch();
    vi.stubGlobal("fetch", fn);
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const card = await screen.findByTestId("selffix-hint-claude-code").catch(() => null);
    const drawer = document.querySelector("details");
    expect(card).toBeNull(); // nothing exited — no selffix hint; use card order instead
    expect(drawer).not.toBeNull();
    const claudeHeading = await screen.findByText("Claude Code");
    expect(claudeHeading.compareDocumentPosition(drawer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("bulk bar applies a custom model to every agent after confirm", async () => {
    const { fn, puts } = makeFetch();
    vi.stubGlobal("fetch", fn);
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const input = await screen.findByTestId("bulk-model-input");
    const apply = screen.getByTestId("bulk-apply");
    expect(apply).toBeDisabled();
    // a custom model name — the point of this round: any string passes through
    await userEvent.type(input, "my-custom/model-v9");
    expect(apply).toBeEnabled();
    await userEvent.click(apply);
    // explicit confirm before overwriting per-agent choices
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("my-custom/model-v9");
    await userEvent.click(screen.getByRole("button", { name: /确认/ }));
    await waitFor(() => expect(puts.length).toBe(2));
    expect(puts.map((p) => p.url)).toEqual(["/api/agents/claude-code/model", "/api/agents/codex/model"]);
    expect(puts.every((p) => p.body.model === "my-custom/model-v9")).toBe(true);
  });
});
