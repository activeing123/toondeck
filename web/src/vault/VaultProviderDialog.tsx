/*
 * VaultProviderDialog (R48) — define or edit a CUSTOM provider.
 *
 * The shipped catalog is read-only; user definitions live in
 * TOONDECK_HOME/vault-providers.json via POST /api/vault/providers and
 * win on id collision (override a built-in's URLs without touching the
 * package). No secret field here on purpose: keys go through the normal
 * "store" flow into the OS keychain, never through this form.
 *
 * Modes: "create" (editable id) / "edit" (id locked, pre-filled).
 * Validation errors come back as clean ok:false from the backend and are
 * shown inline; Escape closes; focus lands on the first editable field.
 */

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

export type ProviderFormDraft = {
  mode: "create" | "edit";
  id: string;
  display_name: string;
  env_var: string;
  base_url: string;
  test_url: string;
  auth_style: string;
  local: boolean;
};

export function VaultProviderDialog({
  draft,
  onClose,
  onSubmit,
}: {
  draft: ProviderFormDraft;
  onClose: () => void;
  onSubmit: (p: ProviderFormDraft) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<ProviderFormDraft>(draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const set = <K extends keyof ProviderFormDraft>(k: K, v: ProviderFormDraft[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await onSubmit(form);
      if (!r.ok) setError(r.error ?? "save failed");
    } finally {
      setBusy(false);
    }
  };

  const fieldCls =
    "w-full rounded-deck border border-deck-line bg-deck-panel px-3 py-2 text-sm focus:border-deck-accent focus:outline-none font-mono";
  const labelCls = "text-xs text-deck-muted";

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="vault-provider-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="animate-dialog-in glass rounded-deck border border-deck-line p-5 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold">
          {draft.mode === "create" ? t("vault.addProvider") : t("vault.editProvider")}
        </h3>

        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor="vp-id">
              {t("vault.fieldId")}
            </label>
            <input
              id="vp-id"
              ref={firstRef}
              data-testid="vp-id"
              value={form.id}
              onChange={(e) => set("id", e.target.value)}
              disabled={draft.mode === "edit"}
              className={`${fieldCls} mt-1 ${draft.mode === "edit" ? "opacity-60" : ""}`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="vp-display">
              {t("vault.fieldDisplayName")}
            </label>
            <input
              id="vp-display"
              data-testid="vp-display"
              value={form.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              className={`${fieldCls} mt-1`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="vp-env">
              {t("vault.fieldEnvVar")}
            </label>
            <input
              id="vp-env"
              data-testid="vp-env"
              value={form.env_var}
              onChange={(e) => set("env_var", e.target.value.toUpperCase())}
              placeholder="MY_PROVIDER_API_KEY"
              className={`${fieldCls} mt-1`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="vp-base">
              {t("vault.fieldBaseUrl")}
            </label>
            <input
              id="vp-base"
              data-testid="vp-base"
              value={form.base_url}
              onChange={(e) => set("base_url", e.target.value)}
              placeholder="https://…/v1"
              className={`${fieldCls} mt-1`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="vp-test">
              {t("vault.fieldTestUrl")}
            </label>
            <input
              id="vp-test"
              data-testid="vp-test"
              value={form.test_url}
              onChange={(e) => set("test_url", e.target.value)}
              className={`${fieldCls} mt-1`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="vp-auth">
              {t("vault.fieldAuthStyle")}
            </label>
            <select
              id="vp-auth"
              data-testid="vp-auth"
              value={form.auth_style}
              onChange={(e) => set("auth_style", e.target.value)}
              className={`${fieldCls} mt-1`}
            >
              <option value="bearer">{t("vault.authBearer")}</option>
              <option value="x-api-key">{t("vault.authXApiKey")}</option>
              <option value="query">{t("vault.authQuery")}</option>
              <option value="none">{t("vault.authNone")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="vp-local"
              checked={form.local}
              onChange={(e) => set("local", e.target.checked)}
            />
            {t("vault.localLabel")}
          </label>
        </div>

        {error && (
          <p className="text-xs text-led-err" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-deck border border-deck-line px-3 py-1.5 text-sm">
            {t("agents.cancel")}
          </button>
          <button
            data-testid="vp-save"
            onClick={submit}
            disabled={busy}
            className="rounded-deck bg-deck-accent px-4 py-1.5 text-sm font-semibold text-deck-bg disabled:opacity-50"
          >
            {busy ? "…" : t("agents.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
