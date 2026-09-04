/*
 * N-R5: the adoption funnel was mute — a discovered server said "收编接管"
 * with zero explanation of what adopting means or where the server came
 * from, and after adopting, the hero kept the stale "1 已接管" count.
 * Contract:
 * - the button reads a full verb phrase (收编进我的配置)
 * - an unmanaged row carries a one-line hint naming the source and the deal
 * (the stale-count fix lives in McpPanel: adopt bumps the hero's reload)
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerTable from "./ServerTable";
import { I18nProvider } from "../i18n";

const rows = [
  {
    name: "echo",
    managed: false,
    transport: "stdio",
    target: "",
    sources: ["cursor", "windsurf"],
    env_keys: [],
    header_keys: [],
    disabled_tools: [],
    toolCount: 3,
    tools: [{ name: "ping", description: "" }],
    status: "ok",
    latencyMs: 301,
    error: null,
  },
];

function mockFetch() {
  return vi.fn(() => Promise.resolve({ json: () => Promise.resolve({}) }));
}

describe("N-R5: adoption speaks the deal", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", mockFetch());
  });

  it("unmanaged rows show the adopt hint and a full verb-phrase button", async () => {
    render(
      <I18nProvider>
        <ServerTable rows={rows} onToggle={vi.fn()} onAdopt={vi.fn()} />
      </I18nProvider>,
    );
    // the adopt block lives inside the expandable row body — open it first
    await userEvent.click(screen.getByTestId("server-row-echo").querySelector("button")!);
    const btn = screen.getByTestId("server-adopt-echo");
    expect(btn).toHaveTextContent(/收编进我的配置/);
    const hint = screen.getByTestId(`adopt-hint-echo`);
    expect(hint).toHaveTextContent(/cursor/);
    expect(hint).toHaveTextContent(/统一管理/);
  });
});
