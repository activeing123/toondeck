import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

/*
 * N-R2 — the first hour decides whether a novice keeps the deck. This card
 * gives them a checkable path out of the box: seal the default password, see
 * the engine prove the tools alive (health check), push everything to every
 * agent (sync), and actually launch one agent (U1-⑤ — the payoff step the
 * original three forgot). Each step flips to ✓ the moment the real action
 * happens somewhere in the app (localStorage flag + live event), and the card
 * removes itself when done or dismissed — it teaches once, then gets out of
 * the way.
 */

export type ClKey = "pw" | "health" | "sync" | "launch";

const FLAGS: Record<ClKey, string> = {
  pw: "toondeck.cl.pw",
  health: "toondeck.cl.health",
  sync: "toondeck.cl.sync",
  launch: "toondeck.cl.launch",
};

const ORDER: ClKey[] = ["pw", "health", "sync", "launch"];

/** One construction of the tick map, so adding a step cannot miss a call site. */
function tickState(): Record<ClKey, boolean> {
  return ORDER.reduce((acc, k) => ({ ...acc, [k]: done(k) }), {} as Record<ClKey, boolean>);
}

export function markChecklistDone(key: ClKey): void {
  try {
    localStorage.setItem(FLAGS[key], "1");
    window.dispatchEvent(new CustomEvent("toondeck:checklist", { detail: key }));
  } catch {
    /* private mode — the card just stays */
  }
}

function done(key: ClKey): boolean {
  try {
    return localStorage.getItem(FLAGS[key]) === "1";
  } catch {
    return false;
  }
}

export default function StarterChecklist() {
  const { t } = useI18n();
  const [ticks, setTicks] = useState<Record<ClKey, boolean>>(tickState);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("toondeck.cl.dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const refresh = () => setTicks(tickState());
    window.addEventListener("toondeck:checklist", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("toondeck:checklist", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (dismissed || ORDER.every((k) => ticks[k])) return null;

  // literal keys (not template interpolation) — the i18n key-space audit
  // statically scans the t-call arguments and cannot see interpolation
  const stepText: Record<ClKey, string> = {
    pw: t("cl.step.pw"),
    health: t("cl.step.health"),
    sync: t("cl.step.sync"),
    launch: t("cl.step.launch"),
  };

  return (
    <div
      data-testid="starter-checklist"
      className="glass rounded-deck p-4 space-y-2 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{t("cl.title")}</p>
        <button
          data-testid="cl-dismiss"
          onClick={() => {
            try {
              localStorage.setItem("toondeck.cl.dismissed", "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          className="text-xs text-deck-muted hover:text-deck-ink"
        >
          {t("cl.dismiss")}
        </button>
      </div>
      <p className="text-xs text-deck-muted">{t("cl.subtitle")}</p>
      <ol className="space-y-1.5">
        {ORDER.map((k, i) => (
          <li
            key={k}
            data-testid={`cl-step-${k}`}
            data-cl-done={ticks[k] ? "1" : "0"}
            className={ticks[k] ? "text-deck-muted" : ""}
          >
            <span className={ticks[k] ? "text-led-ok" : "text-deck-muted"}>
              {ticks[k] ? "✓" : `${i + 1}.`}
            </span>{" "}
            {stepText[k]}
          </li>
        ))}
      </ol>
    </div>
  );
}
