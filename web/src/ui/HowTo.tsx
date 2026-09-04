/*
 * HowTo (R54) — a per-page tutorial that answers the only two questions a
 * newcomer has: do I need to configure anything? which button do I press?
 * Collapsible; the choice persists per page in localStorage so it stays
 * out of the way once read. Steps are resolved i18n strings passed by the
 * owning panel (static key audit sees every call site).
 */
import { useState } from "react";
import { useI18n } from "../i18n";

const KEY_PREFIX = "toondeck.howto.";

export default function HowTo({ page, steps }: { page: string; steps: string[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY_PREFIX + page) !== "0";
    } catch {
      return true;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY_PREFIX + page, next ? "1" : "0");
    } catch {
      /* private mode: session-only, fine */
    }
  };

  return (
    <section
      className="glass rounded-deck p-4 border border-deck-accent/30"
      data-testid={`howto-${page}`}
    >
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">{t("howto.title")}</h2>
        <button
          data-testid={`howto-toggle-${page}`}
          onClick={toggle}
          aria-expanded={open}
          className="ml-auto rounded-deck border border-deck-line px-2 py-1 text-xs text-deck-muted hover:text-deck-ink"
        >
          {open ? t("howto.hide") : t("howto.show")}
        </button>
      </div>
      {open && (
        <ol className="mt-2 space-y-1 text-sm text-deck-muted">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
