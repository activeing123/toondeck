/*
 * N-R14 / U1-① — the two live-action buttons used to be indistinguishable
 * from dead while working: `disabled` plus a 40% opacity dip, label unchanged,
 * no spinner, no word about how long to wait. A novice who clicks "⟳ latest
 * models" and sees nothing happen concludes the product is broken.
 *
 * The fix borrows R27's shape (spinner + changed label) and names the wait in
 * words WITHOUT a number — nobody has measured it against a real provider, and
 * an invented "3-8s" is a promise the product cannot keep.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AgentsPanel from "./AgentsPanel";

const providers = {
  providers: [
    {
      id: "openai",
      display_name: "OpenAI",
      base_url: "https://api.openai.com/v1",
      env_var: "OPENAI_API_KEY",
      configured: true, // the live-action buttons only render for a
      keyless: false, // configured provider — see the `p.configured ?` branch
      models: ["gpt-5.2"],
    },
  ],
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** URL to hold open, and the gate that releases it. */
let hang: string | null = null;
let gate: ReturnType<typeof deferred<{ json: () => Promise<unknown> }>> | null = null;

describe("N-R14: live provider actions show they are working", () => {
  beforeEach(() => {
    window.location.hash = "#/agents";
    hang = null;
    gate = null;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (hang && String(url) === hang && gate) return gate.promise;
        if (url === "/api/agents")
          return Promise.resolve({ json: () => Promise.resolve({ agents: [], total: 0, installed_count: 0 }) });
        if (url === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve({}) });
        if (url === "/api/agents/models") return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
        if (url === "/api/agents/providers") return Promise.resolve({ json: () => Promise.resolve(providers) });
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }),
    );
  });

  async function renderPanel() {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    return within(await screen.findByTestId("provider-section"));
  }

  function hold(url: string) {
    gate = deferred<{ json: () => Promise<unknown> }>();
    hang = url;
    return gate;
  }

  it("swaps the label for a spinner while pulling models", async () => {
    const scope = await renderPanel();
    const g = hold("/api/agents/providers/openai/models/refresh");

    const pull = scope.getByTestId("provider-models-refresh-openai");
    expect(pull.textContent).toMatch(/latest models/i); // idle: plain label
    await userEvent.click(pull);

    const busy = await screen.findByTestId("provider-models-refresh-openai");
    expect(busy.textContent).toMatch(/pulling…/);
    expect(busy.textContent).toMatch(/usually a few seconds/);
    expect(busy.querySelector(".animate-spin")).not.toBeNull(); // R27's spinner, not just dimming
    expect(busy).toBeDisabled();

    g.resolve({ json: () => Promise.resolve({ ok: true, count: 3 }) });
    await vi.waitFor(() =>
      expect(screen.getByTestId("provider-models-refresh-openai").textContent).toMatch(/latest models/i),
    );
  });

  it("locks the sibling action but does not put a spinner on it", async () => {
    // Both buttons share one providerBusy slot, so they must not race — but
    // only the one actually working may claim to be working.
    const scope = await renderPanel();
    const g = hold("/api/agents/providers/openai/models/refresh");

    await userEvent.click(scope.getByTestId("provider-models-refresh-openai"));
    await screen.findByTestId("provider-models-refresh-openai");

    const test = screen.getByTestId("provider-test-openai");
    expect(test).toBeDisabled(); // shares the slot
    expect(test.textContent).toMatch(/test chat/i); // but shows no fake progress
    expect(test.querySelector(".animate-spin")).toBeNull();

    g.resolve({ json: () => Promise.resolve({ ok: true, count: 3 }) });
    await vi.waitFor(() => expect(screen.getByTestId("provider-test-openai")).toBeEnabled());
  });

  it("shows its own wording for a chat test", async () => {
    const scope = await renderPanel();
    const g = hold("/api/agents/providers/openai/test");

    await userEvent.click(scope.getByTestId("provider-test-openai"));
    const busy = await screen.findByTestId("provider-test-openai");
    expect(busy.textContent).toMatch(/testing…/);
    expect(busy.querySelector(".animate-spin")).not.toBeNull();
    // and the pull button must not borrow the test's wording
    expect(screen.getByTestId("provider-models-refresh-openai").textContent).toMatch(/latest models/i);

    g.resolve({ json: () => Promise.resolve({ ok: true, model: "gpt-5.2", reply: "hi" }) });
    await vi.waitFor(() =>
      expect(screen.getByTestId("provider-test-openai").textContent).toMatch(/test chat/i),
    );
  });
});
