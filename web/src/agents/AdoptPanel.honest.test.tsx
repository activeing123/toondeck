/*
 * N-R1/R2 (user feedback): the discover section said "无陌生 agent——全部在册 ✓"
 * which reads as a clean bill of health, but the scan only fingerprints MCP
 * configs (depth-1 dirs, json/toml/yaml) — exe-only installs (omp via npm
 * shim) are invisible to it. Contract:
 * - the empty state is honest about what the scan covers
 * - a manual add form lets the user register any missed agent on the spot
 * - the signature count is framed as "known kinds", not a health check
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AdoptPanel from "./AdoptPanel";

function mockFetch() {
  return vi.fn((url: string) => {
    if (url === "/api/agents/discover")
      return Promise.resolve({ json: () => Promise.resolve({ unknown: [], signatures: 27 }) });
    if (url === "/api/agents/adopt")
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, label: "omp" }) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("N-R2: honest discovery + manual add", () => {
  beforeEach(() => {
    localStorage.setItem("toondeck.lang", "zh");
    vi.stubGlobal("fetch", mockFetch());
  });

  it("empty state admits the scan's blind spots instead of a clean ✓", async () => {
    render(
      <I18nProvider>
        <AdoptPanel onAdopted={() => {}} />
      </I18nProvider>,
    );
    const msg = await screen.findByTestId("discover-empty");
    expect(msg.textContent).toMatch(/只认配置目录|扫描范围/);
    expect(msg.textContent).not.toMatch(/全部在册/);
  });

  it("manual add registers a missed agent with its launch command", async () => {
    render(
      <I18nProvider>
        <AdoptPanel onAdopted={() => {}} />
      </I18nProvider>,
    );
    await userEvent.type(await screen.findByTestId("manual-label"), "omp");
    await userEvent.type(screen.getByTestId("manual-cmd"), "omp");
    await userEvent.click(screen.getByTestId("manual-add"));
    const call = vi
      .mocked(fetch)
      .mock.calls.find((c) => c[0] === "/api/agents/adopt");
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1]?.body))).toEqual({
      label: "omp",
      launch_command: ["omp"],
    });
    expect(await screen.findByText(/已收编.*omp|adopted omp/)).toBeInTheDocument();
  });
});
