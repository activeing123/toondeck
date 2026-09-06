/*
 * N-R2: the first hour is where novices bounce. A four-step starter
 * checklist on the landing page — change the default password, run one
 * health check, sync all agents, launch one agent — turns "what do I do
 * with this?" into a checkable path. U1-⑤ added the fourth: the first three
 * are all preparation, and a novice who finishes them still has nothing
 * running. Contract:
 * - 4 pending rows until flags exist; each flag flips its row to ✓
 * - flags arrive via localStorage (survives reloads) or the
 *   "toondeck:checklist" event (live update, no reload)
 * - all done or dismissed → the card vanishes (no nagging veterans)
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import StarterChecklist, { markChecklistDone } from "./StarterChecklist";
import { I18nProvider } from "../i18n";

const renderCard = () =>
  render(
    <I18nProvider>
      <StarterChecklist />
    </I18nProvider>,
  );

describe("N-R2: starter checklist", () => {
  beforeEach(() => {
    localStorage.removeItem("toondeck.cl.pw");
    localStorage.removeItem("toondeck.cl.health");
    localStorage.removeItem("toondeck.cl.sync");
    localStorage.removeItem("toondeck.cl.launch");
    localStorage.removeItem("toondeck.cl.dismissed");
  });

  it("starts with four pending steps", async () => {
    renderCard();
    const card = await screen.findByTestId("starter-checklist");
    expect(card.querySelectorAll('[data-testid^="cl-step-"]')).toHaveLength(4);
    expect(card.querySelectorAll('[data-cl-done="1"]')).toHaveLength(0);
  });

  it("a stored flag checks that row off, live via event", async () => {
    renderCard();
    await screen.findByTestId("starter-checklist");
    act(() => {
      markChecklistDone("health");
    });
    expect(screen.getByTestId("cl-step-health")).toHaveAttribute("data-cl-done", "1");
    expect(screen.getByTestId("cl-step-health")).toHaveTextContent("✓");
  });

  it("disappears when every step is done", async () => {
    localStorage.setItem("toondeck.cl.pw", "1");
    localStorage.setItem("toondeck.cl.health", "1");
    localStorage.setItem("toondeck.cl.sync", "1");
    localStorage.setItem("toondeck.cl.launch", "1");
    renderCard();
    expect(screen.queryByTestId("starter-checklist")).toBeNull();
  });

  // U1-⑤: the card used to stop at preparation. Three ticks and still
  // nothing was running — the step that pays for the other three has to be
  // on the list, and it must be LAST, because that is the order a novice
  // actually walks.
  it("lists launching an agent as the final step", async () => {
    renderCard();
    const card = await screen.findByTestId("starter-checklist");
    const rows = Array.from(card.querySelectorAll('[data-testid^="cl-step-"]'));
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "cl-step-pw",
      "cl-step-health",
      "cl-step-sync",
      "cl-step-launch",
    ]);
    expect(rows[3].textContent).toMatch(/Agents 页|Agents page/i);
    // and it is numbered 4, not silently appended out of order
    expect(rows[3].textContent).toMatch(/^4\./);
  });

  it("dismiss button hides the card for good", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByTestId("cl-dismiss"));
    expect(screen.queryByTestId("starter-checklist")).toBeNull();
    expect(localStorage.getItem("toondeck.cl.dismissed")).toBe("1");
  });
});
