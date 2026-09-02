import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import DiscoverPanel from "./DiscoverPanel";

const discovered = {
  candidates: [
    { name: "weather", transport: "stdio", command: "npx", args: ["-y", "w"], sources: ["claude-code", "cursor"] },
    { name: "docs", transport: "http", url: "https://x.example/mcp", sources: ["cursor"] },
    { name: "already", transport: "stdio", command: "x", args: [], sources: ["codex"] },
  ],
  sources_scanned: 7,
  total: 3,
};

describe("DiscoverPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/mcp/discover")
          return Promise.resolve({ json: () => Promise.resolve(discovered) });
        return Promise.resolve({ json: () => Promise.resolve({ imported: 1, skipped: 0 }) });
      }),
    );
  });

  it("lists fresh candidates with source chips, hides configured ones", async () => {
    render(<DiscoverPanel configuredNames={["already"]} onImported={() => {}} />);
    expect(await screen.findByText("weather")).toBeInTheDocument();
    expect(await screen.findByText("docs")).toBeInTheDocument();
    expect(screen.queryByText("already")).not.toBeInTheDocument();
    expect(screen.getByText(/7 sources scanned/)).toBeInTheDocument();
  });

  it("imports only picked candidates and reports result", async () => {
    const onImported = vi.fn();
    render(
      <I18nProvider>
        <DiscoverPanel configuredNames={[]} onImported={onImported} />
      </I18nProvider>,
    );
    await screen.findByText("weather");
    await userEvent.click(screen.getByText("docs"));
    await userEvent.click(screen.getByText(/import selected/i));
    const calls = vi.mocked(fetch).mock.calls.filter((c) => c[0] === "/api/mcp/import");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ names: ["docs"] });
    expect(await screen.findByText(/\+1 · 0 skipped/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();
  });

  it("shows all-configured empty state", async () => {
    render(
      <DiscoverPanel
        configuredNames={["weather", "docs", "already"]}
        onImported={() => {}}
      />,
    );
    expect(await screen.findByText(/already configured/)).toBeInTheDocument();
  });
});
