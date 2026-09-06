/*
 * N-lane P1-1 follow-up: R50 collapsed the default view, but expanding one
 * big category (or a broad search) still rendered EVERY card at once —
 * 19311px of page, 929 tab stops on the real 301-skill farm. Contract:
 * progressive windows of 24 cards + one "show N more" button; the window
 * resets whenever the category or the query changes.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPanel from "./SkillsPanel";
import { I18nProvider } from "../i18n";

const PAGE = 24;

function mk(n: number, prefix: string, desc: string) {
  return Array.from({ length: n }, (_, i) => ({
    dirname: `${prefix}-${i}`,
    valid: true,
    name: `${prefix}-${i}`,
    description: desc,
    errors: [],
  }));
}

const state = {
  source: "C:/x/.toondeck/skills",
  exists: true,
  skills: [...mk(60, "comfy-skill", "video workflow helper"), ...mk(50, "atlas-skill", "search and crawl helper")],
  counts: { total: 110, valid: 110 },
};

const doctor = {
  source: { exists: true, total: 110, invalid: [], lint: {} },
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

const cards = () => screen.getAllByTestId(/skill-sync-/).length;

describe("N: progressive card windows", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  it("a 60-skill category opens with 24 cards + a show-more button for the rest", async () => {
    render(
      <I18nProvider>
        <SkillsPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByTestId("category-pill-🎬 视频与音频"));
    expect(cards()).toBe(PAGE);
    const more = screen.getByTestId("show-more-skills");
    expect(more).toHaveTextContent(/36/);
  });

  it("each show-more click grows the window; button disappears when exhausted", async () => {
    render(
      <I18nProvider>
        <SkillsPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByTestId("category-pill-🎬 视频与音频"));
    await userEvent.click(screen.getByTestId("show-more-skills"));
    expect(cards()).toBe(PAGE * 2);
    await userEvent.click(screen.getByTestId("show-more-skills"));
    expect(cards()).toBe(60);
    expect(screen.queryByTestId("show-more-skills")).toBeNull();
  });

  it("switching categories resets the window", async () => {
    render(
      <I18nProvider>
        <SkillsPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByTestId("category-pill-🎬 视频与音频"));
    await userEvent.click(screen.getByTestId("show-more-skills"));
    expect(cards()).toBe(PAGE * 2);
    await userEvent.click(screen.getByTestId("category-pill-🔍 搜索与情报"));
    expect(cards()).toBe(PAGE);
    expect(screen.getByTestId("show-more-skills")).toHaveTextContent(/26/);
  });

  it("typing a query resets the flattened view window too", async () => {
    render(
      <I18nProvider>
        <SkillsPanel />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByTestId("category-pill-🎬 视频与音频"));
    await userEvent.click(screen.getByTestId("show-more-skills"));
    await userEvent.type(screen.getByPlaceholderText(/search skill names/), "helper");
    expect(await screen.findByTestId("search-hits")).toHaveTextContent("110");
    expect(cards()).toBe(PAGE);
    expect(screen.getByTestId("show-more-skills")).toHaveTextContent(/86/);
  });
});
