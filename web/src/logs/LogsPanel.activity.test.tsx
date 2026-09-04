/*
 * R45 — Logs page activity journal. The page used to be a lie for
 * window-only users (empty pipe logs + an empty-state that promised
 * "run a health check and logs will appear" — health checks never
 * write pipe logs). Now the deck's own actions are the ledger.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import LogsPanel from "./LogsPanel";

const statuses = {};

function mockFetch(events: unknown[]) {
  return vi.fn((url: string) => {
    if (url === "/api/agents")
      return Promise.resolve({
        json: () => Promise.resolve({ agents: [{ id: "codex", display_name: "Codex CLI", installed: true }] }),
      });
    if (url === "/api/agents/status") return Promise.resolve({ json: () => Promise.resolve(statuses) });
    if (url === "/api/activity") return Promise.resolve({ json: () => Promise.resolve({ events }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

function renderLogs(events: unknown[]) {
  vi.stubGlobal("fetch", mockFetch(events));
  return render(
    <I18nProvider>
      <LogsPanel />
    </I18nProvider>,
  );
}

describe("Logs activity journal (R45)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders journal events newest-first with ok/fail tone and subject", async () => {
    renderLogs([
      { ts: "2026-09-04T09:00:00+08:00", event: "agent.launch", ok: false, agent: "codex" },
      { ts: "2026-09-04T08:00:00+08:00", event: "mcp.health", servers: 6, ok: 5 },
    ]);
    const section = await screen.findByTestId("activity-journal");
    expect(section).toBeInTheDocument();
    // failure carries the fail word in its aria label
    expect(await screen.findByLabelText(/agent\.launch.*failed|启动 agent.*失败/i)).toBeInTheDocument();
    // subject is shown
    expect(screen.getByText("codex")).toBeInTheDocument();
  });

  it("honest empty state: journal empty ≠ page dead, and the old lie is gone", async () => {
    renderLogs([]);
    await screen.findByTestId("activity-journal");
    expect(await screen.findByText(/nothing yet/i)).toBeInTheDocument();
    // the OLD copy promised health checks produce logs — never again
    expect(screen.queryByText(/run an mcp health check first/i)).not.toBeInTheDocument();
  });

  it("unknown event types degrade to their raw event name, never crash", async () => {
    renderLogs([{ ts: "2026-09-04T07:00:00+08:00", event: "future.thing" }]);
    expect(await screen.findByText("future.thing")).toBeInTheDocument();
  });
});
