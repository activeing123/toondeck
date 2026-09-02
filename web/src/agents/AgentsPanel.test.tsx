import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AgentsPanel from "./AgentsPanel";

const agents = {
  agents: [
    {
      id: "fake",
      display_name: "Fake Agent",
      installed: true,
      evidence: { "exe:fake": true, "dir:~/.fake": true },
      config_paths: {},
      launch_command: ["fake"],
    },
    {
      id: "gone",
      display_name: "Gone Agent",
      installed: false,
      evidence: { "exe:gone": false },
      config_paths: {},
      launch_command: null,
    },
  ],
  total: 2,
  installed_count: 1,
};

const statuses = {
  fake: { state: "running", exit_code: null, pid: 1234 },
};

describe("AgentsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/agents") return Promise.resolve({ json: () => Promise.resolve(agents) });
        if (url === "/api/agents/status")
          return Promise.resolve({ json: () => Promise.resolve(statuses) });
        if (url === "/api/agents/models")
          return Promise.resolve({ json: () => Promise.resolve({ models: {} }) });
        return Promise.resolve({
          json: () => Promise.resolve({ ok: true, agent_id: "fake", exit_code: 0 }),
        });
      }),
    );
    vi.stubGlobal("alert", vi.fn());
  });

  it("renders agent cards with honest states", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    expect(await screen.findByText("Fake Agent")).toBeInTheDocument();
    expect(await screen.findByText(/running · pid 1234/)).toBeInTheDocument();
    expect(await screen.findByText("Gone Agent")).toBeInTheDocument();
    expect(await screen.findByText("not installed")).toBeInTheDocument();
  });

  it("disables launch for missing command and running agent", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("Fake Agent");
    const launchButtons = screen.getAllByRole("button", { name: "launch" });
    expect(launchButtons[0]).toBeDisabled(); // already running
    expect(launchButtons[1]).toBeDisabled(); // no command + not installed
  });

  it("stop button posts and reloads", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    await screen.findByText("Fake Agent");
    const stopBtn = screen.getAllByRole("button", { name: "stop" })[0];
    expect(stopBtn).toBeEnabled();
    await userEvent.click(stopBtn);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/agents/fake/stop", { method: "POST" });
  });

  it("model input persists via PUT (and clears with empty)", async () => {
    render(
      <I18nProvider>
        <AgentsPanel />
      </I18nProvider>,
    );
    const input = await screen.findByPlaceholderText("model…");
    await userEvent.type(input, "gpt-5.2-codex");
    const lastPut = vi
      .mocked(fetch)
      .mock.calls.filter((c) => c[0] === "/api/agents/fake/model")
      .at(-1);
    expect(lastPut).toBeDefined();
    expect(lastPut![1]).toMatchObject({ method: "PUT" });
  });
});
