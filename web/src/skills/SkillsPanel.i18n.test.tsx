/*
N2 RED (novice lane): skills-page jargon goes green — the terms a novice
cannot decode get plain-language i18n copy, and the zh mode must show zero
of the raw jargon strings.

Contract (zh mode via localStorage):
- doctor row reads 体检 with a 回收站 count, never "graveyard"
- watcher button reads 实时守护, never "watch off"/"watching"
- ViewMatrix header explains what it is (已同步到各 agent 的技能目录)
*/

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPanel from "./SkillsPanel";
import { I18nProvider } from "../i18n";

const state = {
  source: "C:/x/.toondeck/skills",
  exists: true,
  skills: [
    { dirname: "good", valid: true, name: "good", description: "A good skill.", errors: [] },
  ],
  counts: { total: 1, valid: 1 },
};

const doctor = {
  source: { exists: true, total: 1, invalid: [], lint: {} },
  views: [{ agent: "claude-code", ok: true, issues: [] }],
  graveyard: { removed: 3 },
  summary: "ok",
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/skills/state") return Promise.resolve({ json: () => Promise.resolve(state) });
    if (url === "/api/skills/doctor") return Promise.resolve({ json: () => Promise.resolve(doctor) });
    if (url === "/api/skills/watcher")
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, running: false }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N2: skills terminology greening (zh)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
    vi.stubGlobal("confirm", vi.fn(() => true));
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("doctor row speaks 体检/回收站, never graveyard", async () => {
    render(<I18nProvider><SkillsPanel /></I18nProvider>);
    const line = await screen.findByText(/回收站 3/);
    expect(line.textContent).toContain("体检");
    expect(line.textContent).not.toContain("graveyard");
  });

  it("watcher button speaks 实时守护, never watch off", async () => {
    render(<I18nProvider><SkillsPanel /></I18nProvider>);
    const btn = await screen.findByRole("button", { name: /实时守护/ });
    expect(btn.textContent).not.toMatch(/watch/);
  });

  it("view matrix header explains itself", async () => {
    render(<I18nProvider><SkillsPanel /></I18nProvider>);
    expect(await screen.findByText(/已同步到各 agent 的技能目录/)).toBeInTheDocument();
    expect(screen.queryByText("agent views")).not.toBeInTheDocument();
  });
});
