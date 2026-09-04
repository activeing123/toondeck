/*
 * UX-017 (R39) — per-skill card actions: single-skill sync, remove (with
 * ConfirmDialog), and a details view. Mocks follow the full-shape rule
 * learned in R28/R33/R37: every endpoint SkillsPanel touches must exist.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../ui/Toast";
import SkillsPanel from "./SkillsPanel";

const state = {
  source: "C:/x/.toondeck/skills",
  exists: true,
  skills: [
    { dirname: "good", valid: true, name: "good", description: "A good skill.", errors: [] },
    {
      dirname: "broken",
      valid: false,
      name: null,
      description: null,
      errors: ["no SKILL.md"],
    },
  ],
  counts: { total: 2, valid: 1 },
};

const doctor = {
  source: { exists: true, total: 2, invalid: ["broken"], lint: { broken: ["no SKILL.md"] } },
  views: [{ agent: "claude-code", ok: true, issues: [] }],
  graveyard: { removed: 0 },
  summary: "degraded",
};

function mockFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  return {
    calls,
    fn: vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/skills/state")
        return Promise.resolve({ json: () => Promise.resolve(state) });
      if (url === "/api/skills/doctor")
        return Promise.resolve({ json: () => Promise.resolve(doctor) });
      if (url === "/api/skills/watcher")
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, running: false }) });
      if (url === "/api/skills/sync/good")
        return Promise.resolve({
          json: () => Promise.resolve({ ok: true, name: "good", results: [] }),
        });
      if (url === "/api/skills/sync/broken")
        return Promise.resolve({
          json: () => Promise.resolve({ ok: false, error: "skill not found: broken" }),
        });
      if (url === "/api/skills/remove")
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, name: "good" }) });
      return Promise.resolve({ json: () => Promise.resolve({}) });
    }),
  };
}

let mock: ReturnType<typeof mockFetch>;

describe("SkillsPanel card actions (UX-017)", () => {
  beforeEach(() => {
    mock = mockFetch();
    vi.stubGlobal("fetch", mock.fn);
  });

  // R50: cards are behind their category pills by default ("good" matches
  // the dev-eng rule via the word "skill"; "broken" lands in other)
  async function expand(dirname: "good" | "broken") {
    const pill = dirname === "good" ? "category-pill-🛠 开发工程" : "category-pill-📦 其他";
    await userEvent.click(await screen.findByTestId(pill));
  }

  it("syncs a single skill from its card", async () => {
    render(
      <ToastProvider>
        <SkillsPanel />
      </ToastProvider>,
    );
    await expand("good");
    await userEvent.click(await screen.findByTestId("skill-sync-good"));
    expect(await screen.findByText(/synced "good"/)).toBeInTheDocument();
    const syncCall = mock.calls.find((c) => c.url === "/api/skills/sync/good");
    expect(syncCall?.init?.method).toBe("POST");
  });

  it("surfaces a toast when single-skill sync fails", async () => {
    render(
      <ToastProvider>
        <SkillsPanel />
      </ToastProvider>,
    );
    await expand("broken");
    await userEvent.click(await screen.findByTestId("skill-sync-broken"));
    expect(await screen.findByText(/sync failed/)).toBeInTheDocument();
  });

  it("removes a skill only after in-app confirmation", async () => {
    render(
      <ToastProvider>
        <SkillsPanel />
      </ToastProvider>,
    );
    await expand("good");
    await userEvent.click(await screen.findByTestId("skill-remove-good"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/good/);
    // cancel → no remove call
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mock.calls.some((c) => c.url === "/api/skills/remove")).toBe(false);
    // retry → confirm → remove call with the right body + success toast
    await userEvent.click(await screen.findByTestId("skill-remove-good"));
    await userEvent.click(screen.getByRole("button", { name: /remove skill/i }));
    const rm = mock.calls.find((c) => c.url === "/api/skills/remove");
    expect(JSON.parse(String(rm?.init?.body))).toEqual({ name: "good" });
    expect(await screen.findByText(/removed "good"/)).toBeInTheDocument();
  });

  it("details view exposes folder name and validation errors", async () => {
    render(
      <ToastProvider>
        <SkillsPanel />
      </ToastProvider>,
    );
    await expand("broken");
    await userEvent.click(await screen.findByTestId("skill-details-broken"));
    expect(await screen.findByText("no SKILL.md")).toBeInTheDocument();
    expect(screen.getAllByText("broken").length).toBeGreaterThan(0);
  });
});
