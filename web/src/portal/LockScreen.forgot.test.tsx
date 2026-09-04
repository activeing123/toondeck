/*
 * N-round2 follow-up: the lock screen led with a four-clause recovery
 * sentence before the novice ever typed a password. Contract: a short
 * reassurance line is always visible; the full recipe only unfolds on
 * demand (it stays available — the point is "you cannot be locked out").
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LockScreen from "./LockScreen";
import { I18nProvider } from "../i18n";

describe("N: forgot-password copy is short until needed", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/portal/state")
          return Promise.resolve({ json: () => Promise.resolve({ password_gate: true, seeded: true }) });
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }),
    );
  });

  it("shows a one-line reassurance; the recipe stays folded", async () => {
    render(
      <I18nProvider>
        <LockScreen onUnlock={() => {}} />
      </I18nProvider>,
    );
    const fold = await screen.findByTestId("forgot-fold");
    expect(fold).toHaveTextContent(/忘记密码/);
    // jsdom keeps closed-<details> children in the DOM — the fold state is
    // the observable contract, not child absence
    expect(fold).not.toHaveAttribute("open");
  });

  it("unfolding reveals the full reset recipe (portal.json + admin123)", async () => {
    render(
      <I18nProvider>
        <LockScreen onUnlock={() => {}} />
      </I18nProvider>,
    );
    const fold = await screen.findByTestId("forgot-fold");
    await userEvent.click(fold.querySelector("summary")!);
    const recipe = screen.getByTestId("forgot-recipe");
    expect(recipe).toHaveTextContent(/portal\.json/);
    expect(recipe).toHaveTextContent(/admin123/);
  });
});
