/*
R27: launch/stop pending state, per-agent.

The old code used ONE global `busy` boolean: clicking launch on agent A
greyed out buttons on every agent on the page, with no visual feedback of
WHICH action was in flight. Now each action carries {id, action}; the acting
button shows a spinner + "starting…"/"stopping…", and other agents' buttons
stay usable.
*/

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AgentsPanel from "./AgentsPanel";

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
    {
      id: "beta",
      display_name: "Beta Agent",
      installed: true,
      evidence: { "exe:beta": true },
      config_paths: {},
      launch_command: ["beta"],
    },
  ],
  total: 2,
  installed_count: 2,
};

const statuses = {
  alpha: { state: "running", exit_code: null, pid: 100 },
  beta: { state: "exited", exit_code: 0, pid: null },
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("R27: per-agent pending state", () => {
  beforeEach(() => {
    window.location.hash = "#/agents";
  });

  it("shows spinner on the acting button and never freezes other agents", async () => {
    const gate = deferred<{ json: () => Promise<unknown> }>();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/agents") return Promise.resolve({ json: () => Promise.resolve(agents) });
      if (url === "/api/agents/status")
        return Promise.resolve({ json: () => Promise.resolve(statuses) });
      if (url === "/api/agents/models")
        return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
      if (url === "/api/agents/beta/launch") return gate.promise; // hang until released
      return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("Beta Agent");

    // launch beta (slow) — its button becomes the pending spinner
    const betaCard = screen.getByText("Beta Agent").closest("section")!;
    await userEvent.click(within(betaCard).getByRole("button", { name: "launch" }));
    const betaPending = await screen.findByRole("button", { name: /starting…/i });
    expect(betaPending).toBeDisabled();

    // alpha is NOT frozen: its stop button stays enabled while beta launches
    const alphaStop = screen.getAllByRole("button", { name: "stop" })[0];
    expect(alphaStop).toBeEnabled();

    // release; the panel settles back with the running flash
    gate.resolve({ json: () => Promise.resolve({ ok: true, mode: "hidden", pid: 42 }) });
    await screen.findByText(/pid 42/);
    expect(screen.queryByRole("button", { name: /starting…/i })).toBeNull();
  });
});
