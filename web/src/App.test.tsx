/*
 * App smoke (R53): #/ is the portal gate — unauthenticated renders the
 * lock screen, not a landing page. The design veto sheet keeps serving
 * its deep link. Authenticated routing is covered per-panel.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/portal/state")
      return Promise.resolve({ json: () => Promise.resolve({ password_gate: true, seeded: false }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("App smoke", () => {
  beforeEach(() => {
    sessionStorage.removeItem("toondeck.portal");
    window.location.hash = "";
    vi.stubGlobal("fetch", mockFetch());
  });

  it("#/ unauthenticated renders the lock screen (R53)", async () => {
    render(<App />);
    const lock = await screen.findByTestId("lock-screen");
    expect(lock).toBeInTheDocument();
    // first run: the default-password hint is visible, honest
    expect(screen.getByTestId("first-run-hint")).toHaveTextContent(/admin123/);
  });

  it("serves the design veto sheet on #/design", () => {
    window.location.hash = "#/design";
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/design directions/i);
    expect(screen.getByText(/Toon Workbench/)).toBeInTheDocument();
    expect(screen.getByText(/Mission Control/)).toBeInTheDocument();
    expect(screen.getByText(/Switchboard/)).toBeInTheDocument();
    expect(screen.getByText("chosen")).toBeInTheDocument();
  });
});
