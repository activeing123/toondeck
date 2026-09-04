/*
 * R44 ⑨ — LED state colors are constructed in exactly one place: ui/Led.tsx,
 * which always emits aria semantics (aria-label when the dot is the only
 * state signal, aria-hidden when adjacent text already carries it). Raw
 * bg-led-* usage anywhere else is a gate violation: a mute dot is exactly
 * the kind of state-only-in-pixels bug this file prevents.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const LED_COLOR = /bg-led-(ok|warn|err)/;

// led-err used as BUTTON styling (background/border/text color on a text
// button) is styling, not state — pattern-whitelisted, documented, deliberate:
// CategoryPills remove button (border/text led-err). led-warn joins the same
// family with the R54/小白-7 danger grading (sync buttons carry ⚠ + color).
const BUTTON_STYLING = /border-led-err|bg-led-err\/\d+|text-led-err\b|border-led-warn|bg-led-warn\/\d+|text-led-warn\b/;

// ConfirmDialog: its only bg-led-err is the danger confirm button background
// (solid, no opacity suffix) — a text button, styling not state.
// DesignSheet is the color-palette spec sheet itself: swatches ARE the
// content (each raw swatch carries aria-hidden since they are decorative).
const ALLOWLIST_FILES = new Set(["Led.tsx", "DesignSheet.tsx", "ConfirmDialog.tsx"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if ((name.endsWith(".tsx") || name.endsWith(".ts")) && !name.endsWith(".test.tsx") && !name.endsWith(".test.ts"))
      yield p;
  }
}

describe("R44 LED aria gate", () => {
  it("bg-led-* colors are constructed only in ui/Led.tsx (+ documented allowlist)", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const base = file.split(/[\\/]/).pop()!;
      if (ALLOWLIST_FILES.has(base)) continue;
      const lines = readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/);
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        if (LED_COLOR.test(code) && !BUTTON_STYLING.test(code)) {
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
