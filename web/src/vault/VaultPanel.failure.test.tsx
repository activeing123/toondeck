/*
R36 / UX-8 RED: a failed vault probe must offer a way forward, not a dead end.

Before: the store input only rendered while !stored. Once a key was stored,
a failed probe left three lines of red text and no way to re-store a fixed
key without deleting first — a dead end exactly when the user is struggling.
Contract now: a failed last_test on a stored provider shows a hint naming
the three actions (re-store, delete, switch model) and reveals a re-store
input inline; successful probes stay clean.
*/

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import VaultPanel from "../vault/VaultPanel";

const PROVIDER = {
  id: "openrouter",
  display_name: "OpenRouter",
  env_var: "OPENROUTER_API_KEY",
  local: false,
  stored: true,
  set_at: "2026-09-03T10:00:00",
  last_test: { ok: false, status: "401", detail: "HTTP 401", at: "2026-09-03T10:05:00" },
};

function fetchWith(state: { providers: unknown[] }) {
  return vi.fn((url: string) => {
    if (url === "/api/vault/state")
      return Promise.resolve({ json: () => Promise.resolve(state) });
    return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
  });
}

describe("R36: vault failure offers actions", () => {
  it("failed probe shows recovery hint and inline re-store input", async () => {
    vi.stubGlobal("fetch", fetchWith({ providers: [PROVIDER] }));
    render(
      <I18nProvider>
        <VaultPanel />
      </I18nProvider>,
    );
    expect(await screen.findByText(/OpenRouter/)).toBeInTheDocument();
    expect(
      screen.getByText(/re-store a corrected key|重存一把修正后的 key/i),
    ).toBeInTheDocument();

    // the recovery path is REAL: click re-store, type, POST — no delete detour
    await userEvent.click(screen.getByRole("button", { name: /re-store|重存/i }));
    await userEvent.type(screen.getByPlaceholderText(/OPENROUTER_API_KEY/), "sk-fixed");
    await userEvent.click(screen.getByTestId("restore-submit-openrouter"));
    await vi.waitFor(() => {
      expect(
        (fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          ([u, init]) =>
            String(u) === "/api/vault/keys" &&
            String((init as RequestInit | undefined)?.method) === "POST",
        ),
      ).toBe(true);
    });
  });

  it("healthy provider stays clean — no recovery noise", async () => {
    vi.stubGlobal(
      "fetch",
      fetchWith({
        providers: [
          { ...PROVIDER, last_test: { ok: true, status: "200", detail: null, at: "2026-09-03T10:05:00" } },
        ],
      }),
    );
    render(
      <I18nProvider>
        <VaultPanel />
      </I18nProvider>,
    );
    await screen.findByText(/OpenRouter/);
    expect(screen.queryByText(/re-store a corrected key/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/OPENROUTER_API_KEY/)).toBeNull();
  });
});
