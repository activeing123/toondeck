/*
 * N-R9: when the engine is unreachable, the MCP and Agents pages say so —
 * the Skills page spun forever on "loading deck…". Contract: a failed
 * /api/skills/state fetch renders an honest error card (with the fix hint),
 * not an eternal spinner.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPanel from "./SkillsPanel";
import { I18nProvider } from "../i18n";

function rejectState() {
  return vi.fn((url: string) => {
    if (String(url).startsWith("/api/skills/state"))
      return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N-R9: engine down says so on the skills page", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", rejectState());
  });

  it("renders an unreachable card instead of an eternal loader", async () => {
    render(
      <I18nProvider>
        <SkillsPanel />
      </I18nProvider>,
    );
    const card = await screen.findByTestId("skills-unreachable");
    expect(card).toHaveTextContent(/连不上/);
    expect(card.textContent).not.toMatch(/loading deck/);
  });
});
