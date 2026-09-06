/*
 * N1 leg 2 — the vault PROBE path, the one save-path fix fe84f5e left behind.
 *
 * Three failure shapes matter to a person on a machine with no keychain
 * backend, and the old code handled none of them honestly:
 *   1. the stable token  → must read as an actionable sentence, not
 *      `keyring_unavailable`;
 *   2. a body with no `error` field (what a 500 looks like) → the old
 *      `!r.ok && r.error` guard matched neither branch and showed NOTHING;
 *   3. success → must say the key WORKS. It used to reuse vault.stored
 *      ("key stored in keychain"), which described an action that never ran.
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

const PROVIDER = {
  id: "openrouter",
  display_name: "OpenRouter",
  env_var: "OPENROUTER_API_KEY",
  local: false,
  stored: true, // the probe button only exists for a key that is already in
  last_test: null, // the vault — see VaultPanel's `!p.local && p.stored`
  set_at: "2026-09-05T10:00:00",
};

function fetchStub(probeReply: unknown) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/vault/state")
      return Promise.resolve({ json: () => Promise.resolve({ providers: [PROVIDER] }) });
    if (String(init?.method) === "POST" && url === "/api/vault/test/openrouter")
      return Promise.resolve({ json: () => Promise.resolve(probeReply) });
    return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
  });
}

async function clickTest() {
  render(
    <I18nProvider>
      <VaultPanel />
    </I18nProvider>,
  );
  await screen.findByText(/OpenRouter/);
  await userEvent.click(screen.getByRole("button", { name: /测试|test/i }));
}

describe("vault probe reports what actually happened", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.ok).mockClear();
  });

  it("turns the keyring token into plain language, never the raw token", async () => {
    vi.stubGlobal(
      "fetch",
      fetchStub({ ok: false, error: "keyring_unavailable", detail: "No recommended backend was available" }),
    );
    await clickTest();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    const shown = String(vi.mocked(toast.error).mock.calls[0][0]);
    expect(shown).toMatch(/系统钥匙串/);
    expect(shown).not.toContain("keyring_unavailable");
    expect(shown).toMatch(/No recommended backend/); // cause survives for triage
  });

  it("is never silent when the body carries no error field (the old 500 shape)", async () => {
    vi.stubGlobal("fetch", fetchStub({ detail: "Internal Server Error" }));
    await clickTest();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    const shown = String(vi.mocked(toast.error).mock.calls[0][0]);
    expect(shown).toMatch(/探测失败/);
    expect(shown).not.toMatch(/^\s*undefined/);
  });

  it("says the key works on success — and stops claiming it stored one", async () => {
    vi.stubGlobal("fetch", fetchStub({ ok: true, provider: "openrouter", status: 200 }));
    await clickTest();
    await vi.waitFor(() => expect(toast.ok).toHaveBeenCalled());
    const shown = String(vi.mocked(toast.ok).mock.calls[0][0]);
    expect(shown).toMatch(/密钥可用/);
    expect(shown).not.toMatch(/已存入/); // a probe spends a key, it never stores one
  });

  it("keeps the server's own words for an ordinary failure", async () => {
    vi.stubGlobal("fetch", fetchStub({ ok: false, error: "HTTP 401" }));
    await clickTest();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain("HTTP 401");
  });
});
