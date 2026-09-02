/** Three deck directions for the #/design veto sheet. A is the chosen baseline. */

export type Palette = {
  id: "A" | "B" | "C";
  label: string;
  vibe: string;
  chosen?: boolean;
  vars: Record<string, string>;
};

export const palettes: Palette[] = [
  {
    id: "A",
    label: "Toon Workbench",
    vibe: "dark glass + toon gold + LED glow · magical, mcptoon 一脉相承",
    chosen: true,
    vars: {
      "--deck-bg": "oklch(0.16 0.02 260)",
      "--deck-panel": "oklch(0.21 0.02 260)",
      "--deck-line": "oklch(0.3 0.02 260)",
      "--deck-ink": "oklch(0.93 0.01 260)",
      "--deck-muted": "oklch(0.65 0.02 260)",
      "--deck-accent": "oklch(0.8 0.15 85)",
    },
  },
  {
    id: "B",
    label: "Mission Control",
    vibe: "Linear/Vercel 式锐利极简 · 专业信任向",
    vars: {
      "--deck-bg": "oklch(0.15 0 0)",
      "--deck-panel": "oklch(0.19 0 0)",
      "--deck-line": "oklch(0.28 0 0)",
      "--deck-ink": "oklch(0.95 0 0)",
      "--deck-muted": "oklch(0.6 0 0)",
      "--deck-accent": "oklch(0.7 0.15 250)",
    },
  },
  {
    id: "C",
    label: "Switchboard",
    vibe: "工业复古接线台 · 拨杆/金属质感，呼应插排 hero",
    vars: {
      "--deck-bg": "oklch(0.18 0.015 70)",
      "--deck-panel": "oklch(0.24 0.02 70)",
      "--deck-line": "oklch(0.36 0.03 70)",
      "--deck-ink": "oklch(0.9 0.03 90)",
      "--deck-muted": "oklch(0.6 0.03 80)",
      "--deck-accent": "oklch(0.75 0.15 60)",
    },
  },
];
