/*
 * backendError — turn a backend error envelope into something a person can act on.
 *
 * CLEAN-ROOM AUDIT 2026-09-05 (cross-platform leg): this dev box has a Windows
 * credential manager, so the happy path was the only path the suite ever
 * exercised. On a headless Linux server — or any machine with no Secret Service
 * — the keyring raises at save time, and both the model-source dialog and the
 * vault forwarded the raw English exception straight into a toast: unreadable,
 * unactionable, and it looked like a ToonDeck bug rather than an environment
 * gap. The backend now emits a stable token; this is the single place that
 * localizes it. Everything else keeps showing the server's own words.
 */

type Translate = (k: string, vars?: Record<string, string | number>) => string;

export interface ErrorEnvelope {
  ok?: boolean;
  error?: string | null;
  detail?: string | null;
}

export function backendError(
  res: ErrorEnvelope | null | undefined,
  t: Translate,
  fallback = "request failed",
  hint?: string,
): string {
  if (!res) return fallback;
  if (res.error === "keyring_unavailable") {
    // The cause is still useful to whoever debugs this, so keep it appended.
    const base = res.detail
      ? `${t("common.keyringUnavailable")}（${res.detail}）`
      : t("common.keyringUnavailable");
    // N5: the same token means different ways out depending on what the user
    // was doing. Saving a key, the fix is the OS keychain. Launching with
    // vault injection, there is an immediate way out — untick the switch —
    // and the caller supplies it rather than a second copy of this sentence.
    return hint ? `${base} ${hint}` : base;
  }
  return res.error ?? fallback;
}
