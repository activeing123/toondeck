import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPanel from "./SkillsPanel";

const state = {
  source: "C:/x/.toondeck/skills",
  exists: true,
  skills: [
    { dirname: "good", valid: true, name: "good", description: "A good skill.", errors: [] },
    { dirname: "broken", valid: false, name: null, description: null, errors: ["no SKILL.md"] },
  ],
  counts: { total: 2, valid: 1 },
};

const doctor = {
  source: { exists: true, total: 2, invalid: ["broken"], lint: { broken: ["no SKILL.md"] } },
  views: [
    { agent: "claude-code", ok: true, issues: [] },
    { agent: "agents", ok: true, issues: [] },
    { agent: "catpaw", ok: true, issues: [] },
    { agent: "codex", ok: true, issues: [] },
    { agent: "roo", ok: true, issues: [] },
    { agent: "opencode", ok: false, issues: ["stale derived file: x.md"] },
  ],
  graveyard: { removed: 3 },
  summary: "degraded",
};

function mockFetch() {
  let watcherRunning = false;
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/skills/state") return Promise.resolve({ json: () => Promise.resolve(state) });
    if (url === "/api/skills/doctor") return Promise.resolve({ json: () => Promise.resolve(doctor) });
    if (url === "/api/skills/watcher") {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      if (body) watcherRunning = body.action === "start";
      const st = { ok: true, running: watcherRunning };
      return Promise.resolve({ json: () => Promise.resolve(st) });
    }
    if (url === "/api/skills/sync") {
      return Promise.resolve({
        json: () => Promise.resolve({ results: [{ agent: "claude-code", ok: true, actions: ["create whole link claude-code"] }] }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("SkillsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("renders skill list with validity badges and view matrix", async () => {
    render(<SkillsPanel />);
    // R50: cards live behind their category pills now ("good" matches the
    // platform/tools rule via the word "skill"; "broken" lands in other)
    await userEvent.click(await screen.findByTestId("category-pill-🛠 开发工程"));
    expect(await screen.findByText("good")).toBeInTheDocument();
    expect(await screen.findByText("A good skill.")).toBeInTheDocument();
    expect(await screen.findByText("agent views")).toBeInTheDocument();
    expect(await screen.findByText(/doctor:/)).toBeInTheDocument();
  });

  it("filters skills by query", async () => {
    render(<SkillsPanel />);
    await screen.findByTestId("pick-category"); // collapsed default
    await userEvent.type(screen.getByPlaceholderText("filter skills…"), "goo");
    // search flattens results — no category click needed
    expect(await screen.findByText("good")).toBeInTheDocument();
    expect(screen.queryByText("broken")).not.toBeInTheDocument();
  });

  it("sync button refreshes with action log", async () => {
    render(<SkillsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /sync all agents/ }));
    expect(await screen.findByText(/create whole link claude-code/)).toBeInTheDocument();
  });

  it("watcher toggle reflects running state", async () => {
    render(<SkillsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /watch off/ }));
    expect(await screen.findByText(/● watching/)).toBeInTheDocument();
  });
});
