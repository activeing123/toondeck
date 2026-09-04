/*
N1 (novice lane): every page must carry a help exit — a link to the GitHub
repo (source + issues). Contract for the standalone component: correct href,
i18n label, opens safely in a new tab, and the shell mounts it (the mount is
adopted by the R53 shell surgery in App.tsx — asserted here via the component
contract only, so this file never fights that in-flight edit).
*/

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpFooter from "./HelpFooter";
import { I18nProvider } from "../i18n";

describe("N1: help-exit footer", () => {
  it("renders the GitHub source & issues link (en)", () => {
    render(
      <I18nProvider>
        <HelpFooter />
      </I18nProvider>,
    );
    const link = screen.getByRole("link", { name: /GitHub · source & issues/ });
    expect(link).toHaveAttribute("href", "https://github.com/activeing123/toondeck");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("renders the zh label under zh mode", () => {
    localStorage.setItem("toondeck.lang", "zh");
    render(
      <I18nProvider>
        <HelpFooter />
      </I18nProvider>,
    );
    expect(screen.getByRole("link", { name: /GitHub · 源码与反馈/ })).toBeInTheDocument();
    localStorage.setItem("toondeck.lang", "en");
  });
});
