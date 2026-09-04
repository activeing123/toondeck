/*
 * R54 — HowTo: the per-page tutorial. Contract:
 * - renders its steps (the two newcomer questions: configure? which button?)
 * - the hide toggle persists per page in localStorage
 * - a re-opened page remembers the collapsed choice
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import HowTo from "./HowTo";

describe("R54: HowTo tutorial card", () => {
  beforeEach(() => {
    localStorage.removeItem("toondeck.howto.mcp");
  });

  it("renders the steps open by default", () => {
    render(
      <I18nProvider>
        <HowTo page="mcp" steps={["step one", "step two"]} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("howto-mcp")).toBeInTheDocument();
    expect(screen.getByText("step one")).toBeInTheDocument();
    expect(screen.getByText("step two")).toBeInTheDocument();
    expect(screen.getByTestId("howto-toggle-mcp")).toHaveAttribute("aria-expanded", "true");
  });

  it("hides on toggle and remembers the collapsed choice", async () => {
    render(
      <I18nProvider>
        <HowTo page="mcp" steps={["step one"]} />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByTestId("howto-toggle-mcp"));
    expect(screen.queryByText("step one")).toBeNull();
    expect(localStorage.getItem("toondeck.howto.mcp")).toBe("0");
    expect(screen.getByTestId("howto-toggle-mcp")).toHaveAttribute("aria-expanded", "false");
  });

  it("a fresh mount restores the remembered collapsed state", async () => {
    localStorage.setItem("toondeck.howto.skills", "0");
    render(
      <I18nProvider>
        <HowTo page="skills" steps={["hidden step"]} />
      </I18nProvider>,
    );
    expect(screen.queryByText("hidden step")).toBeNull();
    await userEvent.click(screen.getByTestId("howto-toggle-skills"));
    expect(screen.getByText("hidden step")).toBeInTheDocument();
    expect(localStorage.getItem("toondeck.howto.skills")).toBe("1");
  });
});
