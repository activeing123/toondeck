import type { CSSProperties } from "react";
import { palettes } from "./palettes";

/** #/design — the three-direction veto sheet. Pure client-side token preview. */
export default function DesignSheet() {
  return (
    <main className="min-h-screen bg-deck-bg text-deck-ink p-10">
      <h1 className="text-2xl font-bold mb-2">Design directions</h1>
      <p className="text-deck-muted text-sm mb-8">
        Direction A is the approved baseline; B/C are one-click vetoes (token layer only).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {palettes.map((p) => (
          <section
            key={p.id}
            className="rounded-deck border border-deck-line bg-deck-panel p-5"
            style={p.vars as CSSProperties}
            data-direction={p.id}
          >
            <div
              className="rounded-deck h-24 mb-4 flex items-end p-3"
              style={{ background: "var(--deck-bg)" }}
            >
              <div className="flex gap-2">
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ background: "var(--deck-accent)" }}
                />
                <span className="h-4 w-4 rounded-full bg-led-ok" aria-hidden="true" />
                <span className="h-4 w-4 rounded-full bg-led-warn" aria-hidden="true" />
                <span className="h-4 w-4 rounded-full bg-led-err" aria-hidden="true" />
              </div>
            </div>
            <h2 className="font-semibold">
              {p.id} · {p.label}
              {p.chosen && (
                <span className="ml-2 text-xs text-deck-accent border border-deck-accent/40 rounded-full px-2 py-0.5">
                  chosen
                </span>
              )}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--deck-muted)" }}>
              {p.vibe}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
