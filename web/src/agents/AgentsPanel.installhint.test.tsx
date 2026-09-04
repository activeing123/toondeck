/*
 * N-R4: an uninstalled card was a dead end — grey LED, "没找到 · 需要先安装",
 * nothing else. Contract: when the adapter carries an install_hint, the
 * card shows the copyable install command right there.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPanel from "./AgentsPanel";
import { I18nProvider } from "../i18n";

const agents = [
  {
    id: "gemini-cli",
    display_name: "Gemini CLI",
    installed: false,
    evidence: { "exe:gemini": false },
    config_paths: { "~/.gemini": false },
    skills_dir: "~/.gemini/skills",
    launch_command: ["gemini"],
    env_config_support: false,
    tui: true,
    install_hint: "npm install -g @google/gemini-cli",
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

describe("N-R4: uninstalled cards carry the install command", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", makeFetch());
  });

  it("shows the copyable install command on the card", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const hint = await screen.findByTestId("install-hint-gemini-cli");
    expect(hint).toHaveTextContent("npm install -g @google/gemini-cli");
    expect(hint.querySelector("code")).toBeInTheDocument();
  });
});
