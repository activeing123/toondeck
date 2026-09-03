/*
ConfirmDialog — in-app destructive-action confirmation (R26).

Replaces window.confirm for the two destructive flows (MCP sync overwrites
agent configs; Vault delete removes a keychain entry). i18n message, a
danger-styled confirm button, and Escape-to-cancel. Focus lands on the
cancel button by default: destructive dialogs should default to the safe
choice for keyboard users.
*/

import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";

export function ConfirmDialog({
  messageKey,
  messageVars,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  messageKey: string;
  messageVars?: Record<string, string | number>;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="glass rounded-deck border border-led-err/40 p-6 max-w-md space-y-4">
        <p className="text-sm">{t(messageKey, messageVars)}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm"
          >
            {t("confirm.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-deck bg-led-err px-3 py-1.5 text-sm font-semibold text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
