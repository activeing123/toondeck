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

function walk(dir: string, includeTests: boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, includeTests));
    // N-R14: the old blanket `.test.` exclusion served the DEAD-key rule (a key
    // kept alive only by a test is still dead to users) but it also blinded the
    // MISSING-key rule, which is exactly how EmptyStates.test.tsx went on
    // referencing onboard.goMcp long after R53 deleted that whole namespace —
    // and t() renders an unknown key as its own name, so the CTA would have
    // shown a user the literal string "onboard.goMcp". Each rule now gets the
    // file set it actually needs.
    else if (/\.(tsx?|jsx?)$/.test(name) && (includeTests || !/\.test\./.test(name))) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, "..");
const notInfra = (f: string) => !f.endsWith("i18n.tsx") && !f.endsWith("logStream.ts");
/** Production code only — what a user can actually reach. Feeds the DEAD rule. */
const SRC_FILES = walk(SRC, false).filter(notInfra);
/** Everything, tests included. Feeds the MISSING rule. */
const ALL_FILES = walk(SRC, true).filter(notInfra);

/** DICT keys, extracted statically — i18n.tsx keeps DICT module-private. */
function dictKeysFromSource(): Set<string> {
  const text = readFileSync(join(SRC, "i18n.tsx"), "utf-8");
  const keys = new Set<string>();
  for (const m of text.matchAll(/["']([a-z0-9]+(?:\.[a-zA-Z0-9]+)+)["']\s*:/g)) {
    keys.add(m[1]);
  }
  return keys;
}

/**
 * Drop comments before matching. The scanner is regex, not an AST, and a test
 * file that merely WRITES ABOUT `t("key")` in its header comment is not a file
 * that CALLS it. Without this, widening the scan to tests produced three
 * phantom keys ("...", "key", and one spanning lines) alongside the real find.
 * `://` is protected so URLs in copy survive.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function usedKeys(files: string[]): Map<string, string[]> {
  const used = new Map<string, string[]>();
  // t("key") literals AND any `*Key="key"` prop (ConfirmDialog's messageKey,
  // ZeroState's titleKey/hintKey/ctaLabelKey — R33 generalized the R26 rule:
  // any prop whose name ends in Key is an i18n key by convention)
  const patterns = [
    /\bt\(\s*["'`]([^"'`]+)["'`]/g,
    /\b[A-Za-z]+Key=["'`]([^"'`]+)["'`]/g,
  ];
  for (const file of files) {
    const text = stripComments(readFileSync(file, "utf-8"));
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        const key = m[1];
        used.set(key, [...(used.get(key) ?? []), file]);
      }
    }
  }
  return used;
}

describe("R24: i18n key-space audit", () => {
  const dictKeys = dictKeysFromSource();
  const usedProd = usedKeys(SRC_FILES);
  const usedAll = usedKeys(ALL_FILES);

  // keys reached through dynamic t(variable) calls — the static regex cannot
  // see them, so they are pinned here with the call site as justification:
  // nav.* — App.tsx `t(n.key)` over the NAV_TABS table
  // led.* — R44 LED labels, called as t(cond ? "led.x" : "led.y") ternaries
  // at every call site (Led label= props across panels; static regex needs a
  // quote directly after `t(` so expression-shaped calls are invisible to it)
  const DYNAMIC_KEYS = new Set([
    "nav.mcp",
    "nav.skills",
    "nav.agents",
    "nav.logs",
    "nav.vault",
    "nav.design",
    "led.ok",
    "led.warn",
    "led.err",
    "led.off",
    "led.installed",
    "led.notInstalled",
    "led.running",
    "led.exited",
    "led.keyStored",
    "led.noKey",
    "led.local",
      "led.timeout",
    // logs.* — R45 activity journal, called as t(ACT_LABEL[e.event]) over a
    // lookup table in LogsPanel (static regex cannot see table-driven calls)
    "logs.actHealth",
    "logs.actSync",
    "logs.actSkillsSync",
    "logs.actSkillsSyncOne",
    "logs.actLaunch",
    "logs.actStop",
    "logs.actProbe",
    "logs.actAdopt",
    // actUnknown is the raw-name fallback reached via ternary in LogsPanel
    "logs.actUnknown",
  ]);

  it("has no dead keys (DICT entries no production t() call references)", () => {
    // production files only on purpose: a key whose sole reader is a test is
    // still invisible to users, so it must not be kept alive by that test.
    const dead = [...dictKeys].filter((k) => !usedProd.has(k) && !DYNAMIC_KEYS.has(k));
    expect(dead).toEqual([]);
  });

  it("has no missing keys (any t() call, test included, that would render a raw key)", () => {
    // every file, tests included: an unknown key renders its own name, so a
    // test that cites a deleted namespace is a real reference to nothing.
    const missing = [...usedAll.keys()].filter((k) => !dictKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("dynamic keys stay real (pinned DICT entries for t(variable) call sites)", () => {
    // if a DICT cleanup removes a dynamic key while its call site lives, this fails
    for (const k of DYNAMIC_KEYS) {
      expect(dictKeys.has(k), `dynamic key ${k} missing from DICT`).toBe(true);
    }
  });
});
