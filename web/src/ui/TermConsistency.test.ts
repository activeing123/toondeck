/*
 * TermConsistency — one action, exactly one Chinese word (N-R14 / U1-②).
 *
 * `probe` had five Chinese spellings across the product (探测 / 实探 / 探针) and
 * `adopt` had two (接管 / 收编). A novice does not read those as one thing
 * spelled loosely — he reads 探测, 实探 and 探针 as three different actions and
 * hunts for the difference. Same for 舰队 (a literal "fleet") and 单一真源
 * ("single source of truth"), architecture vocabulary that describes nothing
 * to someone who just wants his servers working.
 *
 * The dictionary now says each one word. This gate is what keeps it that way:
 * it reads ONLY the zh: "..." values, so a comment may still explain the old
 * spelling without tripping the rule it documents.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DICT = join(__dirname, "..", "i18n.tsx");

/** Every zh: "..." literal, with its line number. Comments cannot match. */
function zhValues(): Array<{ value: string; line: number }> {
  const text = readFileSync(DICT, "utf-8");
  const out: Array<{ value: string; line: number }> = [];
  for (const m of text.matchAll(/zh:\s*"((?:[^"\\]|\\.)*)"/g)) {
    out.push({ value: m[1], line: text.slice(0, m.index).split("\n").length });
  }
  return out;
}

const BANNED: Array<{ name: string; pat: RegExp; rule: string; was: string }> = [
  {
    name: "probe",
    pat: /实探|探针/,
    rule: "probe is 探测, always",
    was: "fleet.probing said 全量实探 and logs.actProbe said 密钥探针",
  },
  {
    name: "adopt",
    pat: /收编/,
    rule: "adopt is 接管, always",
    was: "mcp.adoptOne said 收编进我的配置 while mcp.badgeManaged said 已接管",
  },
  {
    name: "fleet",
    pat: /舰队/,
    rule: "say 能力 — 舰队 is warship vocabulary",
    was: "fleet.overview said 舰队总览",
  },
  {
    name: "single source of truth",
    pat: /单一真源/,
    rule: "say 统一配置",
    was: "fleet.sot and mcp.adoptHint both said 单一真源",
  },
  {
    name: "deck in Chinese copy",
    // \b keeps ~/.toondeck and ToonDeck legal: only the bare English word
    // loose inside a Chinese sentence is the problem.
    pat: /\bdeck\b/,
    rule: "Chinese copy says 控制台; keep deck for the English side, where it is the product metaphor",
    was: "five zh strings told users to restart 「deck」",
  },
];

describe("N-R14 / U1-②: one action, one Chinese word", () => {
  const values = zhValues();

  it("actually read the dictionary", () => {
    // a broken regex here would make every rule below pass vacuously
    expect(values.length).toBeGreaterThan(150);
  });

  for (const b of BANNED) {
    it(`no zh value still says ${b.name} the old way`, () => {
      const hits = values
        .filter((v) => b.pat.test(v.value))
        .map((v) => `  i18n.tsx:${v.line}  ${v.value.slice(0, 72)}`);
      expect(hits, `${b.rule}\nwas: ${b.was}\n` + hits.join("\n")).toEqual([]);
    });
  }
});
