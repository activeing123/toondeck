/*
 * N-R9: the agents page load() has no catch — a dead engine leaves the page
 * spinning on "loading deck…" forever, reading as slow instead of down.
 * Contract: a failed /api/agents fetch renders an honest unreachable card
 * with a retry, like the skills page.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentsPanel from "./AgentsPanel";
import { I18nProvider } from "../i18n";

function rejectAll() {
  return vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
}

describe("N-R9: engine down says so on the agents page", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("renders an unreachable card instead of an eternal loader", async () => {
    vi.stubGlobal("fetch", rejectAll());
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const card = await screen.findByTestId("agents-unreachable");
    expect(card.textContent).toMatch(/连不上/);
    // retry is wired: rejections keep happening, but the click must not throw
    await userEvent.click(screen.getByTestId("agents-retry"));
  });
});
