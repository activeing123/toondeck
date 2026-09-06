/*
 * N-R7: the discover section's adopt action was a bare verb with no
 * explanation of what adopting does (writes a draft adapter so the agent
 * gets a real card), and the copy was engineer-speak. Contract: a visible
 * one-line deal statement above the rows/form.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AdoptPanel from "./AdoptPanel";

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/agents/discover")
      return Promise.resolve({ json: () => Promise.resolve({ unknown: [], signatures: 27 }) });
    if (url === "/api/agents/adopt")
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, label: "omp" }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N-R7: adoption speaks its deal", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", mockFetch());
  });

  it("explains what adopting does before the user clicks", async () => {
    render(
      <I18nProvider>
        <AdoptPanel onAdopted={() => {}} />
      </I18nProvider>,
    );
    const hint = await screen.findByTestId("discover-hint");
    expect(hint.textContent).toMatch(/添加后.*卡片|gets its own card/);
  });

  it("manual add flow still works end to end", async () => {
    render(
      <I18nProvider>
        <AdoptPanel onAdopted={() => {}} />
      </I18nProvider>,
    );
    await userEvent.type(await screen.findByTestId("manual-label"), "omp");
    await userEvent.click(screen.getByTestId("manual-add"));
    // N-R14 / U1-②: adopt is 接管 everywhere; 收编 is gone.
    expect(await screen.findByText(/已接管.*omp|adopted omp/)).toBeInTheDocument();
  });
});
