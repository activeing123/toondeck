/*
UX-C1 gate: no bare CJK literals in production TSX/TS chrome.

Whitelist (per audit UX-C1): i18n DICT itself, test files, and DATA files
(categories.ts — skill taxonomy labels double as filter identifiers;
palettes.ts — design-sheet vibe copy). Everything else must go through t().
This test walks the source tree so the rule stays enforced forever.
*/

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DICT } from "../i18n";

const SRC = join(__dirname, "..");
const ALLOWLIST_FILES = new Set(["i18n.tsx", "categories.ts", "palettes.ts"]);
const ALLOWLIST_PATTERNS: [RegExp, string][] = [
  // the language-toggle button label itself ("中文" = the zh option's name)
  [/\? "EN" : "中文"/, "App.tsx lang toggle"],
];
const CJK = /[\u4e00-\u9fff]/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if ((name.endsWith(".tsx") || name.endsWith(".ts")) && !name.endsWith(".test.tsx") && !name.endsWith(".test.ts"))
      yield p;
  }
}

describe("C1 CJK literal gate", () => {
  it("production chrome has no hardcoded CJK outside the allowlist", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (ALLOWLIST_FILES.has(file.split(/[\\/]/).pop()!)) continue;
      const source = readFileSync(file, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "") // strip block comments (dev-facing docs)
        .split(/\r?\n/);
      source.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, ""); // strip line comments
        if (CJK.test(code)) {
          const allowed = ALLOWLIST_PATTERNS.some(([re]) => re.test(code));
          if (!allowed) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  // R42 ⑤: the gate must SEE every panel — a narrowed SRC or a new panel
  // landing outside the walk is exactly the blind spot this gate exists to
  // prevent (R33's lesson: VaultPanel was a CJK-gate blind spot once).
  it("walk covers every panel directory (no blind spots)", () => {
    const files = [...walk(SRC)].map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"));
    expect(files.length).toBeGreaterThanOrEqual(20);
    for (const panel of ["agents", "mcp", "skills", "vault", "logs", "ui", "design"]) {
      expect(files.some((f) => f.startsWith(`${panel}/`)), `panel "${panel}" not scanned`).toBe(true);
    }
  });

  it("DICT en values contain no CJK (the R30 bug class, pinned forever)", () => {
    const offenders = Object.entries(DICT)
      .filter(([, v]) => CJK.test(v.en))
      .map(([k, v]) => `${k}: ${v.en}`);
    expect(offenders).toEqual([]);
  });

  it("every DICT key carries non-empty en and zh", () => {
    const offenders = Object.entries(DICT)
      .filter(([, v]) => typeof v?.en !== "string" || typeof v?.zh !== "string" || !v.en.trim() || !v.zh.trim())
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });
});
