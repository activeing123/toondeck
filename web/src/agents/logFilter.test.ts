import { describe, expect, it } from "vitest";
import { filterLogLines } from "./logFilter";

describe("filterLogLines", () => {
  const lines = [
    "2026-09-03 10:00:01 INFO server started",
    "2026-09-03 10:00:02 ERROR disk full",
    "2026-09-03 10:00:03 INFO health ok",
    "2026-09-03 10:00:04 error: retry scheduled",
  ];

  it("matches case-insensitively", () => {
    const r = filterLogLines(lines, "ERROR");
    expect(r.total).toBe(2);
    expect(r.matches).toEqual([lines[1], lines[3]]);
    expect(r.capped).toBe(false);
  });

  it("returns nothing for blank queries (no 'show everything' trap)", () => {
    const r = filterLogLines(lines, "   ");
    expect(r.matches).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("caps matches and reports the honest total", () => {
    const many = Array.from({ length: 1200 }, (_, i) => `line ${i} needle`);
    const r = filterLogLines(many, "needle", 500);
    expect(r.matches.length).toBe(500);
    expect(r.total).toBe(1200);
    expect(r.capped).toBe(true);
  });
});
