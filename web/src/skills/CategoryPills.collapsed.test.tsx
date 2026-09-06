/*
 * R50 — P1-1 keyboard marathon + P1-3 naked regex, both fixed by the
 * collapsed-category IA:
 * - default view: pills only (~15 tab stops, was 929) + honest hint
 * - pill toggles its category's cards; aria-pressed tracks state
 * - search flattens results across all categories
 * - the pills render label + count ONLY; the match pattern lives in the
 *   tooltip (was rendered as visible text via a backwards destructure)
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPanel from "./SkillsPanel";

// 30 skills across two categories — enough to prove the collapse without
// rendering the real 301.
const state = {
  source: "C:/x/.toondeck/skills",
  exists: true,
  skills: [
    ...Array.from({ length: 12 }, (_, i) => ({
      dirname: `comfy-skill-${i}`,
      valid: true,
      name: `comfy-skill-${i}`,
      description: "video workflow helper",
      errors: [],
    })),
    ...Array.from({ length: 18 }, (_, i) => ({
      dirname: `atlas-skill-${i}`,
      valid: true,
      name: `atlas-skill-${i}`,
      description: "search and crawl helper",
      errors: [],
    })),
  ],
  counts: { total: 30, valid: 30 },
};

const doctor = {
  source: { exists: true, total: 30, invalid: [], lint: {} },
  views: [{ agent: "claude-code", ok: true, issues: [] }],
  graveyard: { removed: 0 },
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

describe("R50: collapsed categories + no naked regex", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  it("default view renders ZERO skill cards and the pick-category hint", async () => {
    render(<SkillsPanel />);
    await screen.findByTestId("pick-category");
    expect(screen.queryAllByTestId(/skill-sync-/)).toHaveLength(0);
    // keyboard marathon sentinel: default view has few tab stops, not 900+
    expect(screen.getAllByRole("button").length).toBeLessThan(25);
  });

  it("pill expands its category; second click collapses again", async () => {
    render(<SkillsPanel />);
    const videoPill = await screen.findByTestId("category-pill-🎬 视频与音频");
    expect(videoPill).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(videoPill);
    expect(videoPill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId(/skill-sync-/)).toHaveLength(12);
    expect(screen.queryByTestId("pick-category")).toBeNull();
    await userEvent.click(videoPill);
    expect(screen.queryAllByTestId(/skill-sync-/)).toHaveLength(0);
    expect(await screen.findByTestId("pick-category")).toBeInTheDocument();
  });

  it("pill tooltip carries the match pattern — never visible text", async () => {
    render(<SkillsPanel />);
    const videoPill = await screen.findByTestId("category-pill-🎬 视频与音频");
    expect(videoPill.getAttribute("title")).toMatch(/video\|comfy/);
    // the pattern is NOT rendered as visible text (P1-3 regression guard)
    const pills = screen.getAllByTestId(/category-pill-/);
    for (const pill of pills) {
      expect(within(pill).queryByText(/video\|comfy/)).toBeNull();
      expect(within(pill).queryByText(/search\|搜索/)).toBeNull();
    }
  });

  it("typing a query flattens matches across all categories", async () => {
    render(<SkillsPanel />);
    await screen.findByTestId("pick-category");
    await userEvent.type(screen.getByPlaceholderText(/search skill names/), "search");
    expect(await screen.findByTestId("search-hits")).toHaveTextContent("18");
    expect(screen.getAllByTestId(/skill-sync-/)).toHaveLength(18);
  });
});
