/*
R32: log line filtering — the pure logic.

A read-only xterm stream is great for watching and useless for finding.
filterLogLines powers the filter view: case-insensitive substring match,
capped output so a 10k-line buffer cannot nuke the DOM, and an honest
capped flag so the UI can say "showing the first N of M matches".
*/

export interface FilteredLog {
  matches: string[];
  total: number;
  capped: boolean;
}

export function filterLogLines(lines: string[], query: string, cap = 500): FilteredLog {
  if (!query.trim()) return { matches: [], total: 0, capped: false };
  const needle = query.trim().toLowerCase();
  const matches: string[] = [];
  let total = 0;
  for (const line of lines) {
    if (line.toLowerCase().includes(needle)) {
      total += 1;
      if (matches.length < cap) matches.push(line);
    }
  }
  return { matches, total, capped: total > matches.length };
}
