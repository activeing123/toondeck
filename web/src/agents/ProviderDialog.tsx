/*
 * ProviderDialog (R46) — glass modal for enabling/editing model sources.
 * Replaces the R-era inline password inputs (a bare <input type=password>
 * with no labels, nested in a <details>, unable to edit existing profiles).
 *
 * Three modes, one dialog:
 * - "enable"  : turn a catalog provider on (needs a key unless keyless)
 * - "edit"    : change base_url / rotate key of an existing profile —
 *               blank key = KEEP the stored key (merge semantics, PUT)
 * - "custom"  : define a brand-new custom source (POST)
 *
 * Key visibility is opt-in via a show/hide toggle (shoulder-surfing safe);
 * dialog closes on Escape; focus lands on the first field.
 */

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

export type ProviderDraft = {
  mode: "enable" | "edit" | "custom";
  id: string; // profile name (existing for enable/edit, user-typed for custom)
  displayName: string;
  baseUrl: string; // current value, pre-filled
  hasStoredKey: boolean; // enable/edit: a key is already in the keyring
  keyless: boolean; // catalog provider that needs no key
};

export function ProviderDialog({
  draft,
  onClose,
  onSubmit,
}: {
  draft: ProviderDraft;
  onClose: () => void;
  onSubmit: (r: { name: string; baseUrl: string; apiKey: string; ok: boolean; error?: string }) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(draft.mode === "custom" ? "" : draft.id);
  const [url, setUrl] = useState(draft.baseUrl);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const keyRequired = !draft.keyless && draft.mode === "enable";
  const nameEditable = draft.mode === "custom";

  const submit = async () => {
    if (nameEditable && !name.trim()) return;
    if (keyRequired && !key.trim()) {
      setKeyError(true);
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), baseUrl: url.trim(), apiKey: key, ok: true });
    } finally {
      setBusy(false);
    }
  };

  const fieldCls =
    "w-full rounded-deck border border-deck-line bg-deck-panel px-3 py-2 text-sm focus:border-deck-accent focus:outline-none";
  const labelCls = "text-xs text-deck-muted";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={draft.displayName}
      data-testid="provider-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="animate-dialog-in glass rounded-deck border border-deck-line p-5 w-full max-w-md space-y-4">
        <div>
          <h3 className="font-semibold">{draft.displayName}</h3>
          <p className="mt-0.5 text-xs text-deck-muted">
            {draft.mode === "edit" && t("agents.keyKeepHint")}
            {draft.mode === "enable" && !draft.keyless && t("agents.keyNewHint")}
            {draft.mode === "custom" && t("agents.customSource")}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor="pd-name">
              {t("agents.nameLabel")}
            </label>
            <input
              id="pd-name"
              ref={firstFieldRef}
              data-testid="pd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!nameEditable}
              placeholder={t("agents.profileName")}
              className={`${fieldCls} mt-1 ${!nameEditable ? "opacity-60" : ""} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="pd-url">
              {t("agents.urlLabel")}
            </label>
            <input
              id="pd-url"
              data-testid="pd-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("agents.baseUrl")}
              className={`${fieldCls} mt-1 font-mono`}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={labelCls} htmlFor="pd-key">
                {t("agents.keyLabel")}
              </label>
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="text-xs text-deck-muted hover:text-deck-ink"
              >
                {showKey ? t("agents.hideKey") : t("agents.showKey")}
              </button>
            </div>
            {draft.hasStoredKey && (
              <p className="mb-1 mt-1 text-xs text-led-ok">{t("agents.keyStoredChip")}</p>
            )}
            <input
              id="pd-key"
              data-testid="pd-key"
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyError(false);
              }}
              placeholder={
                draft.mode === "enable" || draft.mode === "custom"
                  ? t("agents.keyPlaceholder")
                  : t("agents.keyKeepHint")
              }
              className={`${fieldCls} mt-1 ${keyError ? "border-led-err" : ""}`}
            />
            {keyError && (
              <p className="mt-1 text-xs text-led-err" role="alert">
                {t("agents.keyMissing")}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm"
          >
            {t("agents.cancel")}
          </button>
          <button
            data-testid="pd-save"
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
