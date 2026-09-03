/*
 * Led — the single constructor for LED state dots (R44 ⑨).
 *
 * Why: LED colors used to be raw Tailwind classes sprinkled across 25 sites;
 * none of them told a screen reader anything (color-only state = invisible
 * state). Every LED now comes from here:
 *
 * - <Led label="running" />   → the dot IS the state signal → role=img +
 *   aria-label (localized by the caller at the call site)
 * - <Led decorative />        → adjacent text already carries the state →
 *   aria-hidden (never a silent duplicate or a mute pixel)
 *
 * The gate test (LedAriaGate.test.ts) keeps raw bg-led-* out of the rest of
 * the tree; ConfirmDialog's danger button is a documented allowlist entry
 * (led-err as button background = styling, not state).
 */

type LedTone = "ok" | "warn" | "err" | "off";

const TONE: Record<LedTone, string> = {
  ok: "bg-led-ok shadow-glow-ok",
  warn: "bg-led-warn",
  err: "bg-led-err shadow-glow-err",
  off: "bg-deck-muted",
};

export function Led({
  tone,
  label,
  size = "sm",
}: {
  tone: LedTone;
  /** When given, the dot is the only state signal: role=img + aria-label. */
  label?: string;
  size?: "sm" | "md";
}) {
  const cls = `rounded-full ${size === "md" ? "h-2.5 w-2.5" : "h-2 w-2"} ${TONE[tone]} inline-block`;
  if (label) {
    return <span role="img" aria-label={label} className={cls} />;
  }
  return <span aria-hidden="true" className={cls} />;
}

export type { LedTone };
