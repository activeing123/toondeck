/*
 * N-R3: the change-password form printed the backend's raw English error
 * ("current password is wrong") to zh users. Contract: known backend errors
 * map to zh copy; unknown ones get a zh prefix instead of naked English.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function mockFetch(error: string) {
  return vi.fn((url: string) => {
    if (url === "/api/portal/state")
      return Promise.resolve({ json: () => Promise.resolve({ password_gate: true, seeded: true }) });
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
    if (url === "/api/portal/password")
      return Promise.resolve({ json: () => Promise.resolve({ ok: false, error }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

async function submitChange(error: string) {
  vi.stubGlobal("fetch", mockFetch(error));
  sessionStorage.setItem("toondeck.portal", "1");
  window.location.hash = "#/mcp";
  render(<App />);
  await userEvent.click(await screen.findByTestId("portal-change"));
  await userEvent.type(await screen.findByTestId("portal-cur"), "oldpass");
  await userEvent.type(screen.getByTestId("portal-new"), "newpass1");
  await userEvent.click(screen.getByTestId("portal-save"));
  await waitFor(() => expect(screen.getByTestId("portal-msg")).toBeInTheDocument());
  return screen.getByTestId("portal-msg").textContent;
}

describe("N-R3: change-password errors speak zh", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
  });

  it("maps the wrong-current-password error to zh", async () => {
    expect(await submitChange("current password is wrong")).toMatch(/当前密码不对/);
  });

  it("prefixes unknown backend errors instead of naked English", async () => {
    const msg = await submitChange("some new backend failure");
    expect(msg).toMatch(/修改失败/);
    expect(msg).not.toBe("some new backend failure");
  });
});
