/*
 * N3 — the launch payload the copy has been promising since R48.
 *
 * `LaunchIn.use_vault` existed, `vault.resolve_env()` existed, and
 * vault.guideStep3 told users to "tick 使用保险库 at launch". There was no such
 * tick anywhere, so the field stayed false, resolve_env() never ran, and a key
 * the user stored could not reach an agent process. These tests pin the wire:
 * the switch must actually put the flag in the POST body, and stop must stay
 * bodyless (a Content-Type with no body makes FastAPI reject the call).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { toast } from "../ui/Toast";
import AgentsPanel from "./AgentsPanel";

vi.mock("../ui/Toast", () => ({
  toast: { error: vi.fn(), ok: vi.fn(), info: vi.fn() },
}));

const agents = {
  agents: [
    {
      id: "alpha",
      display_name: "Alpha Agent",
      installed: true,
      evidence: { "exe:alpha": true },
      config_paths: {},
      launch_command: ["alpha"],
    },
  ],
  total: 1,
  installed_count: 1,
};

describe("launch carries the vault flag", () => {
  let bodies: Record<string, string | undefined>;

  beforeEach(() => {
    window.location.hash = "#/agents";
    localStorage.setItem("toondeck.lang", "en"); // the assertions below read English labels
    bodies = {};
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(init?.method) === "POST") bodies[url] = init?.body ? String(init.body) : undefined;
      if (url === "/api/agents") return Promise.resolve({ json: () => Promise.resolve(agents) });
      if (url === "/api/agents/status")
        return Promise.resolve({ json: () => Promise.resolve({ alpha: { state: "exited", exit_code: 0, pid: null } }) });
      if (url === "/api/agents/models")
        return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, mode: "hidden", pid: 7 }) });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  async function renderPanel() {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("Alpha Agent");
  }

  it("defaults to OFF and says so in the body", async () => {
    await renderPanel();
    const box = screen.getByTestId("use-vault-on-launch");
    expect(box).not.toBeChecked(); // must not silently change existing behavior
    await userEvent.click(within(screen.getByText("Alpha Agent").closest("section")!).getByRole("button", { name: "launch" }));
    const sent = JSON.parse(bodies["/api/agents/alpha/launch"] ?? "{}");
    expect(sent.use_vault).toBe(false);
  });

  it("sends use_vault=true once the user ticks the switch", async () => {
    await renderPanel();
    await userEvent.click(screen.getByTestId("use-vault-on-launch"));
    expect(screen.getByTestId("use-vault-on-launch")).toBeChecked();
    await userEvent.click(within(screen.getByText("Alpha Agent").closest("section")!).getByRole("button", { name: "launch" }));
    const sent = JSON.parse(bodies["/api/agents/alpha/launch"] ?? "{}");
    expect(sent.use_vault).toBe(true);
  });

  it("sends no body at all for stop", async () => {
    // A running agent offers stop, not launch. Stub it in that state directly —
    // the panel does not refetch status into a running card on its own.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (String(init?.method) === "POST") bodies[url] = init?.body ? String(init.body) : undefined;
        if (url === "/api/agents") return Promise.resolve({ json: () => Promise.resolve(agents) });
        if (url === "/api/agents/status")
          return Promise.resolve({ json: () => Promise.resolve({ alpha: { state: "running", exit_code: null, pid: 7 } }) });
        if (url === "/api/agents/models")
          return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }),
    );
    await renderPanel();
    // Ticked on purpose: a stop must ignore the vault switch, not send it.
    await userEvent.click(screen.getByTestId("use-vault-on-launch"));
    await userEvent.click(
      within(screen.getByText("Alpha Agent").closest("section")!).getByRole("button", { name: "stop" }),
    );
    expect(bodies["/api/agents/alpha/stop"]).toBeUndefined();
  });
});

/*
 * N5: wiring the checkbox made resolve_env() reachable from an ordinary click.
 * A keyring that died after a key was stored (metadata still says stored:true)
 * used to make the launch endpoint throw past its handler — FastAPI answered 500
 * with no `error` field, and the old `${r.error ?? "action failed"}` line printed
 * the fallback with no cause and no way out. The backend now emits the stable
 * token; this checks the UI turns it into plain language plus the one thing the
 * user can actually do.
 */
describe("N5: a launch the keyring refuses explains itself", () => {
  beforeEach(() => {
    window.location.hash = "#/agents";
    localStorage.setItem("toondeck.lang", "zh");
    vi.mocked(toast.error).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/agents")
          return Promise.resolve({ json: () => Promise.resolve(agents) });
        if (url === "/api/agents/status")
          return Promise.resolve({ json: () => Promise.resolve({ alpha: { state: "exited", exit_code: 0, pid: null } }) });
        if (url === "/api/agents/models")
          return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
        if (url === "/api/agents/alpha/launch")
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                ok: false,
                error: "keyring_unavailable",
                detail: "No recommended backend was available",
              }),
          });
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }),
    );
  });

  it("gives the cause and the way out, never the raw token", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("Alpha Agent");
    await userEvent.click(screen.getByTestId("use-vault-on-launch"));
    await userEvent.click(
      within(screen.getByText("Alpha Agent").closest("section")!).getByRole("button", { name: /启动|launch/ }),
    );

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    const msg = String(vi.mocked(toast.error).mock.calls[0][0]);
    expect(msg).toMatch(/钥匙串/); // the shared keyring sentence
    expect(msg).toMatch(/取消勾选/); // the way out, specific to launching
    expect(msg).toMatch(/No recommended backend/); // the cause survives for triage
    expect(msg).not.toMatch(/keyring_unavailable/); // the token is never shown raw
  });

  it("keeps the vault hint off actions that have no checkbox", async () => {
    // stop carries no vault switch, so the same token must not drag the
    // "untick it" advice along with it.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/agents")
          return Promise.resolve({ json: () => Promise.resolve(agents) });
        if (url === "/api/agents/status")
          return Promise.resolve({ json: () => Promise.resolve({ alpha: { state: "running", exit_code: null, pid: 7 } }) });
        if (url === "/api/agents/models")
          return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
        if (url === "/api/agents/alpha/stop")
          return Promise.resolve({
            json: () => Promise.resolve({ ok: false, error: "keyring_unavailable", detail: "boom" }),
          });
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }),
    );
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("Alpha Agent");
    await userEvent.click(
      within(screen.getByText("Alpha Agent").closest("section")!).getByRole("button", { name: /停止|stop/ }),
    );
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    const msg = String(vi.mocked(toast.error).mock.calls[0][0]);
    expect(msg).toMatch(/钥匙串/); // still the honest keyring sentence
    expect(msg).not.toMatch(/取消勾选/); // but not advice about a switch it never saw
  });
});
