/*
R34: visual-consistency sentinels. These pin the CSS contracts that make the
deck feel like one deck: a global focus-visible ring (keyboard users must
always see where they are — the audit found ZERO focus styles before R34),
micro-motion for toasts and dialogs, and a reduced-motion escape hatch.
CSS is read as text: the contract is the rule existing in tokens.css.
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "tokens.css"), "utf-8");

describe("R34: deck-wide visual contracts (tokens.css)", () => {
  it("has a global focus-visible ring (keyboard visibility is not optional)", () => {
    expect(css).toMatch(/:where\([^)]*\):focus-visible/);
    expect(css).toMatch(/outline:\s*2px solid var\(--color-deck-accent\)/);
  });

  it("toasts and dialogs animate in", () => {
    expect(css).toMatch(/@keyframes toast-in/);
    expect(css).toMatch(/@keyframes dialog-in/);
    expect(css).toMatch(/\.animate-toast-in\s*\{/);
    expect(css).toMatch(/\.animate-dialog-in\s*\{/);
  });

  it("motion respects prefers-reduced-motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.animate-toast-in/s);
  });
});
