/*
 * LockScreen (R53) — the deck is an admin console; #/ lands on a password
 * gate, not a marketing page. Default password admin123 (first login
 * seals it into TOONDECK_HOME/portal.json as a salted hash). Session =
 * sessionStorage "toondeck.portal" (per-tab, dies with the tab). Forgot
 * the password → delete portal.json → back to admin123; the hint says so.
 */
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

const SESSION_KEY = "toondeck.portal";

export function portalUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [firstRun, setFirstRun] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/portal/state")
      .then((r) => r.json())
      .then((s) => setFirstRun(s?.seeded === false))
      .catch(() => setFirstRun(false));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      }).then((x) => x.json());
      if (r.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onUnlock();
      } else {
        setError(t("portal.wrong"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-deck-bg text-deck-ink flex flex-col items-center justify-center gap-5 p-4">
      <h1 className="text-3xl font-bold tracking-tight">
        Toon<span className="text-deck-accent">Deck</span>
      </h1>
      <div
        role="dialog"
        aria-label={t("portal.lockTitle")}
        data-testid="lock-screen"
        className="glass rounded-deck p-6 w-full max-w-sm space-y-4"
      >
        <p className="font-semibold">{t("portal.lockTitle")}</p>
        {firstRun && (
          <p className="text-xs text-deck-muted" data-testid="first-run-hint">
            {t("portal.firstRun")}
          </p>
        )}
        <input
          type="password"
          data-testid="portal-pw"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("portal.placeholder")}
          className="w-full rounded-deck border border-deck-line bg-deck-panel px-3 py-2 text-sm focus:border-deck-accent focus:outline-none"
        />
        {error && (
          <p className="text-xs text-led-err" role="alert">
            {error}
          </p>
        )}
        <button
          data-testid="portal-unlock"
          onClick={submit}
          disabled={busy || !pw}
          className="w-full rounded-deck bg-deck-accent px-3 py-2 text-sm font-semibold text-deck-bg disabled:opacity-40"
        >
          {busy ? "…" : t("portal.unlock")}
        </button>
        <p className="text-xs text-deck-muted">{t("portal.forgot")}</p>
      </div>
    </main>
  );
}
