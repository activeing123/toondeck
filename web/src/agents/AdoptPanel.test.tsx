import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import AdoptPanel from "./AdoptPanel";

const discovered = {
  unknown: [
    { label: "mysteryai", config_files: ["C:/u/.mysteryai/mcp.json"], evidence: "mcpServers fingerprint" },
    { label: "Bad Dir!", config_files: [], evidence: "x" },
  ],
  signatures: 26,
};

describe("AdoptPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/agents/discover")
          return Promise.resolve({ json: () => Promise.resolve(discovered) });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, label: "mysteryai" }),
        });
      }),
    );
  });

  it("lists unknown agents with evidence, filters invalid labels", async () => {
    render(
      <I18nProvider>
        <AdoptPanel onAdopted={() => {}} />
      </I18nProvider>,
    );
    expect(await screen.findByText("mysteryai")).toBeInTheDocument();
    expect(screen.queryByText("Bad Dir!")).not.toBeInTheDocument();
    expect(screen.getByText(/26 signatures/)).toBeInTheDocument();
  });

  it("adopts with a launch command and reports result", async () => {
    const onAdopted = vi.fn();
    render(
      <I18nProvider>
        <AdoptPanel onAdopted={onAdopted} />
      </I18nProvider>,
    );
    await screen.findByText("mysteryai");
    await userEvent.type(screen.getByTestId("draft-mysteryai"), "mysteryai --serve");
    await userEvent.click(screen.getByText(/adopt/i));
    const call = vi
      .mocked(fetch)
      .mock.calls.find((c) => c[0] === "/api/agents/adopt");
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1]?.body))).toEqual({
      label: "mysteryai",
      launch_command: ["mysteryai", "--serve"],
    });
    expect(await screen.findByText(/adopted mysteryai/)).toBeInTheDocument();
    expect(onAdopted).toHaveBeenCalled();
  });

  it("offers --version probe for unknown launch", async () => {
    render(
      <I18nProvider>
        <AdoptPanel onAdopted={() => {}} />
      </I18nProvider>,
    );
    await screen.findByText("mysteryai");
    expect(screen.getByText(/probe/i)).toBeInTheDocument();
  });
});
