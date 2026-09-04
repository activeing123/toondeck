/*
 * N-R2: the first hour is where novices bounce. A three-step starter
 * checklist on the landing page — change the default password, run one
 * health check, sync all agents — turns "what do I do with this?" into a
 * checkable path. Contract:
 * - 3 pending rows until flags exist; each flag flips its row to ✓
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
    localStorage.removeItem("toondeck.cl.dismissed");
  });

  it("starts with three pending steps", async () => {
    renderCard();
    const card = await screen.findByTestId("starter-checklist");
    expect(card.querySelectorAll('[data-testid^="cl-step-"]')).toHaveLength(3);
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
    renderCard();
    expect(screen.queryByTestId("starter-checklist")).toBeNull();
  });

  it("dismiss button hides the card for good", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByTestId("cl-dismiss"));
    expect(screen.queryByTestId("starter-checklist")).toBeNull();
    expect(localStorage.getItem("toondeck.cl.dismissed")).toBe("1");
  });
});
