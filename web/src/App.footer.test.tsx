/*
 * N1 regression lock: the help-exit footer must survive shell refactors.
 * The other R53 surgery dropped the planned mount - this pins the contract:
 * every shell page (skills route needs only the skills APIs) ends with the
 * GitHub source & issues link.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const state = {
  source: "C:/x/.toondeck/skills",
  exists: true,
  skills: [{ dirname: "good", valid: true, name: "good", description: "A good skill.", errors: [] }],
  counts: { total: 1, valid: 1 },
};

const doctor = {
  source: { exists: true, total: 1, invalid: [], lint: {} },
  views: [{ agent: "claude-code", ok: true, issues: [] }],
  graveyard: { removed: 0 },
  summary: "ok",
};

describe("N1: help-exit footer mounted in the shell", () => {
  beforeEach(() => {
    window.location.hash = "#/skills";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/skills/state") return Promise.resolve({ json: () => Promise.resolve(state) });
        if (url === "/api/skills/doctor") return Promise.resolve({ json: () => Promise.resolve(doctor) });
        if (url === "/api/skills/watcher")
          return Promise.resolve({ json: () => Promise.resolve({ ok: true, running: false }) });
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }),
    );
  });

  it("the skills page ends with the GitHub source & issues link", async () => {
    render(<App />);
    const link = await screen.findByRole("link", { name: /GitHub/ });
    expect(link).toHaveAttribute("href", "https://github.com/activeing123/toondeck");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
