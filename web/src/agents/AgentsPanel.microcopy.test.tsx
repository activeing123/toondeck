/*
 * R51 — P1-2: key explanations must not live only in hover titles.
 * Keyboard and touch users can never see a title attribute. Contract:
 * - an agent WITH a launch command shows the command as persistent text
 * - an installed GUI-only agent (catpaw) shows WHY launch is disabled
 * - the model-source select is labeled with persistent text
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPanel from "./AgentsPanel";

const state = {
  agents: [
    {
      id: "claude-code",
      display_name: "Claude Code",
      installed: true,
      launch_command: ["claude", "--dangerously-skip-permissions"],
      evidence: { "cmd:claude": true },
      tui: true,
    },
    {
      id: "catpaw",
      display_name: "CatPaw",
      installed: true,
      launch_command: null,
      evidence: { "dir:~/.catpaw": true },
      tui: true,
    },
  ],
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/agents") return Promise.resolve({ json: () => Promise.resolve(state) });
    if (url === "/api/agents/status")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            "claude-code": { state: "never", exit_code: null, logs: [] },
            catpaw: { state: "never", exit_code: null, logs: [] },
          }),
      });
    if (url === "/api/agents/profiles")
      return Promise.resolve({ json: () => Promise.resolve({}) });
    if (url === "/api/health")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            ok: true,
            service: "toondeck",
            version: "0.1.0",
            engine: { available: true, version: "0.7.1" },
          }),
      });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("R51: no hover-only explanations on agent cards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  it("launch command is persistent text on the card", async () => {
    render(<AgentsPanel />);
    const cmd = await screen.findByTestId("launch-cmd-claude-code");
    expect(cmd).toHaveTextContent("claude --dangerously-skip-permissions");
  });

  it("GUI-only agent shows the disabled-reason as visible copy", async () => {
    render(<AgentsPanel />);
    const hint = await screen.findByTestId("gui-only-catpaw");
    expect(hint).toHaveTextContent(/GUI-only|仅桌面窗/);
    // and the launch button really is disabled
    const launchBtns = screen.getAllByRole("button", { name: /launch|启动/ });
    const catpawCard = hint.closest("section")!;
    expect(catpawCard).toContainElement(launchBtns.find((b) => (b as HTMLButtonElement).disabled)!);
  });

  it("model source select is labeled by persistent text, not a title", async () => {
    render(<AgentsPanel />);
    const label = await screen.findByText(/API model source:|API 模型源：/);
    expect(label.closest("section")).toContainElement(
      screen.getAllByRole("combobox").find((el) => el.getAttribute("title") === null)!,
    );
  });
});
