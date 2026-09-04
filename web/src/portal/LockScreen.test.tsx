/*
 * R53 — the portal gate. Contract:
 * - wrong password → role=alert, no session
 * - right password → sessionStorage set, hash moves to #/mcp
 * - sidebar lock button clears the session and returns to the gate
 * - change-password form posts {current,new} and reports the result
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function mockFetch(loginOk: boolean, changeOk = true) {
  return vi.fn((url: string, _init?: RequestInit) => {
    if (url === "/api/portal/state")
      return Promise.resolve({ json: () => Promise.resolve({ password_gate: true, seeded: false }) });
    if (url === "/api/portal/login")
      return Promise.resolve({ json: () => Promise.resolve({ ok: loginOk }) });
    if (url === "/api/portal/password")
      return Promise.resolve({ json: () => Promise.resolve({ ok: changeOk, error: changeOk ? undefined : "current password is wrong" }) });
    if (url === "/api/mcp/state")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            servers: [],
            server_total: 0,
            disabled_total: 0,
            token_savings: { method: "len//4", tool_total: 0, full_json_tokens: 0, slim_tokens: 0, saved_pct: 0 },
          }),
      });
    if (url === "/api/mcp/tools")
      return Promise.resolve({ json: () => Promise.resolve({ adopted_total: 0, tools_total: 0, servers: [] }) });
    if (url === "/api/fleet/overview")
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            mcptoon: { servers_total: 0, tools_cached: 0, disabled_tools: 0, discovered_total: 0, sources_scanned: 0, sources_breakdown: {}, config_path: "x" },
            agents: { total: 0, installed: 0, cli_capable: 0 },
            skills: { total: 0, valid: 0, views_ok: 0, views_total: 0 },
          }),
      });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("R53: portal gate", () => {
  beforeEach(() => {
    sessionStorage.removeItem("toondeck.portal");
    window.location.hash = "";
  });

  it("wrong password shows an alert and keeps the gate up", async () => {
    vi.stubGlobal("fetch", mockFetch(false));
    render(<App />);
    await userEvent.type(await screen.findByTestId("portal-pw"), "nope");
    await userEvent.click(screen.getByTestId("portal-unlock"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/wrong password|密码不对/);
    expect(sessionStorage.getItem("toondeck.portal")).toBeNull();
    expect(screen.getByTestId("lock-screen")).toBeInTheDocument();
  });

  it("right password unlocks: session set, routed into the console", async () => {
    vi.stubGlobal("fetch", mockFetch(true));
    render(<App />);
    await userEvent.type(await screen.findByTestId("portal-pw"), "admin123");
    await userEvent.click(screen.getByTestId("portal-unlock"));
    await screen.findByTestId("mcp-managed-count"); // console rendered
    expect(sessionStorage.getItem("toondeck.portal")).toBe("1");
    expect(window.location.hash).toBe("#/mcp");
  });

  it("first run shows the default-password hint; seeded machines get none", async () => {
    vi.stubGlobal("fetch", mockFetch(true));
    render(<App />);
    expect(await screen.findByTestId("first-run-hint")).toBeInTheDocument();
  });

  it("sidebar lock clears the session and returns to the gate", async () => {
    sessionStorage.setItem("toondeck.portal", "1");
    vi.stubGlobal("fetch", mockFetch(true));
    window.location.hash = "#/mcp";
    render(<App />);
    await userEvent.click(await screen.findByTestId("portal-lock"));
    expect(sessionStorage.getItem("toondeck.portal")).toBeNull();
    expect(await screen.findByTestId("lock-screen")).toBeInTheDocument();
  });

  it("change-password form posts current+new and reports the outcome", async () => {
    sessionStorage.setItem("toondeck.portal", "1");
    const fetchMock = mockFetch(true, true);
    vi.stubGlobal("fetch", fetchMock);
    window.location.hash = "#/mcp";
    render(<App />);
    await userEvent.click(await screen.findByTestId("portal-change"));
    await userEvent.type(screen.getByTestId("portal-cur"), "admin123");
    await userEvent.type(screen.getByTestId("portal-new"), "hunter22");
    await userEvent.click(screen.getByTestId("portal-save"));
    await screen.findByRole("status");
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/portal/password") as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1]!.body))).toEqual({ current: "admin123", new: "hunter22" });
    expect(screen.getByRole("status")).toHaveTextContent(/password changed|密码已修改/);
  });
});
