/*
R24 RED: static audit of the i18n key space — two failure classes the
render-time tests cannot catch:
1. DEAD KEYS: DICT entries no t() call references (translation debt,
   bloated bundle, stale copy nobody can see).
2. MISSING KEYS: t("...") calls whose key is not in DICT — these render the
   raw key to the user (the exact leak the CJK gate hunts, wearing a mask).
Scans the AST-ish source text: t("key") / t('key') literals across src,
plus t("key", {vars}) — the same call shapes the app uses.
*/

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, "..");
const SRC_FILES = walk(SRC).filter(
  (f) => !f.endsWith("i18n.tsx") && !f.endsWith("logStream.ts"),
);

/** DICT keys, extracted statically — i18n.tsx keeps DICT module-private. */
function dictKeysFromSource(): Set<string> {
  const text = readFileSync(join(SRC, "i18n.tsx"), "utf-8");
  const keys = new Set<string>();
  for (const m of text.matchAll(/["']([a-z0-9]+(?:\.[a-zA-Z0-9]+)+)["']\s*:/g)) {
    keys.add(m[1]);
  }
  return keys;
}

function usedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const re = /\bt\(\s*["'`]([^"'`]+)["'`]/g;
  for (const file of SRC_FILES) {
    const text = readFileSync(file, "utf-8");
    for (const m of text.matchAll(re)) {
      const key = m[1];
      used.set(key, [...(used.get(key) ?? []), file]);
    }
  }
  return used;
}

describe("R24: i18n key-space audit", () => {
  const dictKeys = dictKeysFromSource();
  const used = usedKeys();

  // keys reached through dynamic t(variable) calls — the static regex cannot
  // see them, so they are pinned here with the call site as justification:
  // nav.* — App.tsx L110 `t(n.key)` over the NAV_TABS table (L70-76)
  const DYNAMIC_KEYS = new Set([
    "nav.deck",
    "nav.mcp",
    "nav.skills",
    "nav.agents",
    "nav.logs",
    "nav.vault",
    "nav.design",
  ]);

  it("has no dead keys (DICT entries no t() call references)", () => {
    const dead = [...dictKeys].filter((k) => !used.has(k) && !DYNAMIC_KEYS.has(k));
    expect(dead).toEqual([]);
  });

  it("has no missing keys (t() calls that would render a raw key)", () => {
    const missing = [...used.keys()].filter((k) => !dictKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("dynamic keys stay real (pinned DICT entries for t(variable) call sites)", () => {
    // if a DICT cleanup removes a dynamic key while its call site lives, this fails
    for (const k of DYNAMIC_KEYS) {
      expect(dictKeys.has(k), `dynamic key ${k} missing from DICT`).toBe(true);
    }
  });
});
