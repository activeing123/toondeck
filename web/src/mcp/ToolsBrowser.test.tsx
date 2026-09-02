import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import ToolsBrowser from "./ToolsBrowser";

const toolsBody = {
  checked: 2,
  servers: [
    {
      server: "tooly",
      status: "ok",
      latency_ms: 12,
      error: null,
      tools: [
        { name: "greet", description: "say hi" },
        { name: "bye", description: "" },
      ],
    },
    { server: "dead", status: "error", latency_ms: 3, error: "[PROCESS_DIED] gone", tools: [] },
  ],
};

describe("ToolsBrowser", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve(toolsBody) }),
      ),
    );
  });

  it("shows per-server tool counts and dead-server errors after load", async () => {
    render(
      <I18nProvider>
        <ToolsBrowser />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByText(/browse tools/i));
    expect(await screen.findByText("tooly")).toBeInTheDocument();
    expect(screen.getAllByText(/2 tools/).length).toBeGreaterThan(0);
    expect(screen.getByText(/PROCESS_DIED/)).toBeInTheDocument();
  });

  it("expands a server to list tool names", async () => {
    render(
      <I18nProvider>
        <ToolsBrowser />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByText(/browse tools/i));
    await screen.findByText("tooly");
    await userEvent.click(screen.getByText("tooly"));
    expect(await screen.findByText(/greet/)).toBeInTheDocument();
    expect(screen.getByTitle("say hi")).toBeInTheDocument();
    expect(screen.getByText(/bye/)).toBeInTheDocument();
  });
});
