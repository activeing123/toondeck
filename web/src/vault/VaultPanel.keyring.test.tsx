/*
 * Wiring proof for the keychain-failure token (clean-room audit 2026-09-05).
 *
 * The helper unit test proves the mapping exists; this proves the panels
 * actually route through it, so a user on a box with no keychain backend reads
 * an actionable sentence instead of the machine token or a raw exception.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import VaultPanel from "./VaultPanel";
import { toast } from "../ui/Toast";

vi.mock("../ui/Toast", () => ({
  toast: { error: vi.fn(), ok: vi.fn(), info: vi.fn() },
}));

const KEYRING_FAIL = {
  ok: false,
  error: "keyring_unavailable",
  detail: "No recommended backend was available",
};

function fetchStub() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/vault/state")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            providers: [
              {
                id: "openrouter",
                display_name: "OpenRouter",
                env_var: "OPENROUTER_API_KEY",
                local: false,
                stored: false,
                set_at: null,
                last_test: null,
              },
            ],
          }),
      });
    if (String(init?.method) === "POST" && url === "/api/vault/keys")
      return Promise.resolve({ json: () => Promise.resolve(KEYRING_FAIL) });
    return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
  });
}

describe("keychain failure reaches the user as plain language", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.mocked(toast.error).mockClear();
    vi.stubGlobal("fetch", fetchStub());
  });

  it("vault store shows the localized hint, never the raw token", async () => {
    render(
      <I18nProvider>
        <VaultPanel />
      </I18nProvider>,
    );
    await screen.findByText(/OpenRouter/);
    await userEvent.type(screen.getByPlaceholderText(/OPENROUTER_API_KEY/), "sk-or-1");
    await userEvent.click(screen.getByRole("button", { name: /保存|store/i }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    const shown = String(vi.mocked(toast.error).mock.calls[0][0]);
    expect(shown).toMatch(/系统钥匙串/);
    expect(shown).not.toContain("keyring_unavailable");
    expect(shown).not.toMatch(/^\s*keychain error/);
    // the cause is still there for triage, just not as the headline
    expect(shown).toMatch(/No recommended backend/);
  });
});
