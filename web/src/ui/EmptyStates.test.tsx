/*
R33: empty states. Four panels rendered silent empty grids when there was
no data yet — a user landing there sees nothing and learns nothing. Every
zero-data panel now shows a ZeroState: icon, an honest title, a hint that
names the next action. The component is generic; each panel supplies copy.
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ZeroState } from "./ZeroState";
import AgentsPanel from "../agents/AgentsPanel";
import VaultPanel from "../vault/VaultPanel";
import SkillsPanel from "../skills/SkillsPanel";

describe("ZeroState component", () => {
  it("renders icon, title, hint and optional CTA", () => {
    render(
      <I18nProvider>
        <ZeroState icon="🤖" titleKey="agents.emptyTitle" hintKey="agents.emptyHint" ctaHref="#/mcp" ctaLabelKey="onboard.goMcp" />
      </I18nProvider>,
    );
    expect(screen.getByText(/no agents detected yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Install a supported CLI agent/i)).toBeInTheDocument();
    const cta = screen.getByRole("link");
    expect(cta).toHaveAttribute("href", "#/mcp");
  });
});

function emptyFetch(extra: Record<string, unknown> = {}) {
  return vi.fn((url: string) => {
    const empty: Record<string, unknown> = {
      "/api/agents": { agents: [], total: 0, installed_count: 0 },
      "/api/agents/status": {},
      "/api/agents/models": { models: {} },
      "/api/vault/state": { providers: [] },
      "/api/skills/state": { skills: [], categories: [], counts: { total: 0, valid: 0 }, source: "test" },
      "/api/skills/doctor": { summary: "ok", graveyard: { removed: 0 }, views: [] },
      "/api/skills/watcher": { running: false },
      ...extra,
    };
    const body = empty[url] ?? {};
    return Promise.resolve({ json: () => Promise.resolve(body) });
  });
}

describe("panels show guidance instead of silence", () => {
  it("AgentsPanel with zero agents", async () => {
    vi.stubGlobal("fetch", emptyFetch());
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    expect(await screen.findByTestId("zero-state")).toBeInTheDocument();
    expect(screen.getByText(/no agents detected yet/i)).toBeInTheDocument();
  });

  it("VaultPanel with zero providers", async () => {
    vi.stubGlobal("fetch", emptyFetch());
    render(
      <I18nProvider>
        <VaultPanel />
      </I18nProvider>,
    );
    expect(await screen.findByTestId("zero-state")).toBeInTheDocument();
    expect(screen.getByText(/no providers detected/i)).toBeInTheDocument();
  });

  it("SkillsPanel with zero skills", async () => {
    vi.stubGlobal("fetch", emptyFetch());
    render(
      <I18nProvider>
        <SkillsPanel />
      </I18nProvider>,
    );
    expect(await screen.findByTestId("zero-state")).toBeInTheDocument();
    expect(screen.getByText(/no skills yet/i)).toBeInTheDocument();
  });
});
