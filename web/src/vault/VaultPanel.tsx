import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { toast } from "../ui/Toast";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ZeroState } from "../ui/ZeroState";
import { backendError } from "../ui/backendError";
import { Led } from "../ui/Led";
import { VaultProviderDialog, type ProviderFormDraft } from "./VaultProviderDialog";

type ProviderRow = {
  id: string;
  display_name: string;
  env_var: string;
  base_url: string | null;
  test_url: string | null;
  auth_style: string;
  local: boolean;
  custom: boolean;
  stored: boolean;
  set_at: string | null;
  last_test: { ok: boolean; status: string; detail: string | null; at: string } | null;
};

export default function VaultPanel() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [reStore, setReStore] = useState<string | null>(null);
  // R48: user-defined provider editor
  const [dialog, setDialog] = useState<ProviderFormDraft | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await fetch("/api/vault/state").then((r) => r.json());
    setProviders(s.providers);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (id: string) => {
    const secret = drafts[id]?.trim();
    if (!secret) return;
    setBusy(id);
    try {
      const r = await fetch("/api/vault/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id, secret }),
      }).then((r2) => r2.json());
      if (!r.ok) toast.error(backendError(r, t, "store failed"));
      else setReStore(null); // recovery complete: collapse the re-store input
      setDrafts((d) => ({ ...d, [id]: "" }));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const del = async (id: string) => {
    setConfirmDelete(id);
  };

  const doDelete = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/vault/keys/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const probe = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/vault/test/${id}`, { method: "POST" }).then((r2) => r2.json());
      // CLEAN-ROOM AUDIT 2026-09-05 leg 2 — two fixes on this one line pair:
      // 1. Judge success FIRST. The old `!r.ok && r.error` guard went totally
      //    silent on a 500 body (FastAPI puts the reason in `detail`, not
      //    `error`), so a missing keychain looked like a dead button.
      // 2. Route failures through backendError, the single localization
      //    entrypoint — this was the one save path fe84f5e left forwarding the
      //    raw token to the user. Success no longer claims the key was stored.
      if (r.ok) toast.ok(t("vault.probeOk"));
      else toast.error(backendError(r, t, t("vault.probeFailed")));
      await load();
    } finally {
      setBusy(null);
    }
  };

  // R48: user-defined provider CRUD
  const submitProvider = async (form: ProviderFormDraft): Promise<{ ok: boolean; error?: string }> => {
    const body = {
      id: form.id.trim(),
      display_name: form.display_name.trim(),
      env_var: form.env_var.trim(),
      base_url: form.base_url.trim(),
      test_url: form.test_url.trim() || null,
      auth_style: form.auth_style,
      local: form.local,
    };
    const r = await fetch("/api/vault/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((x) => x.json());
    if (!r.ok) return { ok: false, error: r.error };
    setDialog(null);
    toast.ok(t("vault.providerSaved"));
    await load();
    return { ok: true };
  };

  const removeProvider = async (id: string) => {
    await fetch(`/api/vault/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
    setConfirmRemove(null);
    await load();
  };

  if (!providers) return <p className="text-deck-muted">{t("common.loading")}</p>;
  const stored = providers.filter((p) => p.stored).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Vault <span className="text-deck-accent">{stored}</span>
        <span className="ml-3 text-sm text-deck-muted">
          {t("vault.providers", { n: providers.length })}
        </span>
      </h1>

      <p className="text-sm text-deck-muted">
        {t("vault.relation")}
      </p>

      {/* R48: the config explainer — what "configure the vault" actually means */}
      <section className="glass rounded-deck p-4" data-testid="vault-guide">
        <h2 className="font-semibold mb-2">{t("vault.guideTitle")}</h2>
        <ol className="space-y-1 text-sm text-deck-muted">
          <li>{t("vault.guideStep1")}</li>
          <li>{t("vault.guideStep2")}</li>
          <li>{t("vault.guideStep3")}</li>
        </ol>
        {/* N-R14 / N3: the launch-alias sentence was dropped from here — the
            backend takes `aliases`, but no UI anywhere can send them, so the
            guide was teaching an operation nobody can perform. */}
        <div className="mt-3">
          <button
            data-testid="vault-add-provider"
            onClick={() =>
              setDialog({
                mode: "create",
                id: "",
                display_name: "",
                env_var: "",
                base_url: "",
                test_url: "",
                auth_style: "bearer",
                local: false,
              })
            }
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:border-deck-accent"
          >
            {t("vault.addProvider")}
          </button>
        </div>
      </section>

      {providers.length === 0 ? (
        <ZeroState
          icon="🔐"
          titleKey="vault.emptyTitle"
          hintKey="vault.emptyHint"
          ctaHref="#/agents"
          ctaLabelKey="common.ctaGoAgents"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers.map((p) => (
          <section key={p.id} className="glass rounded-deck p-4">
            <div className="flex items-center gap-2">
              <Led
                tone={p.local || p.stored ? "ok" : "off"}
                label={`${p.display_name}: ${t(p.local ? "led.local" : p.stored ? "led.keyStored" : "led.noKey")}`}
              />
              <h2 className="font-semibold">{p.display_name}</h2>
              {p.custom && (
                <span
                  data-testid="custom-badge"
                  className="rounded-full border border-deck-accent/50 px-2 py-0.5 text-xs text-deck-accent"
                >
                  {t("vault.customBadge")}
                </span>
              )}
              <span className="ml-auto font-mono text-xs text-deck-muted">{p.env_var}</span>
            </div>
            {p.custom && (
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  data-testid={`provider-edit-${p.id}`}
                  onClick={() =>
                    setDialog({
                      mode: "edit",
                      id: p.id,
                      display_name: p.display_name,
                      env_var: p.env_var,
                      base_url: p.base_url ?? "",
                      test_url: p.test_url ?? "",
                      auth_style: p.auth_style || "bearer",
                      local: p.local,
                    })
                  }
                  className="rounded-deck border border-deck-line px-2 py-1 hover:border-deck-accent"
                >
                  {t("vault.editProvider")}
                </button>
                <button
                  data-testid={`provider-remove-${p.id}`}
                  onClick={() => setConfirmRemove(p.id)}
                  className="rounded-deck border border-deck-line px-2 py-1 text-deck-muted hover:text-led-err"
                >
                  {t("vault.removeProvider")}
                </button>
              </div>
            )}

            {p.last_test && (
              <p className={`mt-2 text-xs ${p.last_test.ok ? "text-led-ok" : "text-led-err"}`}>
                {t("vault.lastProbe", {
                  result: `${p.last_test.ok ? "ok" : "failed"} (${p.last_test.status})`,
                })}
                {p.last_test.detail ? ` — ${p.last_test.detail}` : ""} · {p.last_test.at}
              </p>
            )}
            {!p.local && p.stored && p.last_test && !p.last_test.ok && (
              <p className="mt-1 text-xs text-led-err">{t("vault.failedHint")}</p>
            )}
            {reStore === p.id && (
              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  placeholder={`${p.env_var}…`}
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  className="flex-1 rounded-deck bg-deck-panel2 px-3 py-1.5 text-sm"
                />
                <button
                  data-testid={`restore-submit-${p.id}`}
                  onClick={() => save(p.id)}
                  disabled={busy === p.id || !(drafts[p.id] ?? "").trim()}
                  className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg disabled:opacity-40"
                >
                  {busy === p.id ? "…" : t("vault.reStore")}
                </button>
              </div>
            )}
            {!p.local && !p.stored && (
              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  placeholder={`${p.env_var}…`}
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  className="flex-1 rounded-deck bg-deck-panel2 px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => save(p.id)}
                  disabled={busy === p.id || !(drafts[p.id] ?? "").trim()}
                  className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg disabled:opacity-40"
                >
                  {busy === p.id ? "…" : t("vault.store")}
                </button>
              </div>
            )}
            {!p.local && p.stored && (
              <div className="mt-3 flex gap-2">
                <span className="text-sm text-led-ok">
                  {t("vault.stored")}
                  {p.set_at ? ` · ${p.set_at}` : ""}
                </span>
                {!p.last_test || p.last_test.ok ? (
                  <>
                    <button
                      onClick={() => probe(p.id)}
                      disabled={busy === p.id}
                      className="ml-auto rounded-deck border border-deck-line px-3 py-1.5 text-sm disabled:opacity-40"
                    >
                      {t("vault.test")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setReStore(reStore === p.id ? null : p.id)}
                    disabled={busy === p.id}
                    className="ml-auto rounded-deck border border-led-err/50 px-3 py-1.5 text-sm text-led-err disabled:opacity-40"
                  >
                    {t("vault.reStore")}
                  </button>
                )}
                <button
                  onClick={() => del(p.id)}
                  disabled={busy === p.id}
                  className="rounded-deck border border-deck-line px-3 py-1.5 text-sm text-deck-muted hover:text-led-err disabled:opacity-40"
                >
                  {t("vault.delete")}
                </button>
              </div>
            )}
            {p.local && (
              <p className="mt-3 text-sm text-deck-muted">{t("vault.local")}</p>
            )}
          </section>
        ))}
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          messageKey="vault.deleteConfirm"
          messageVars={{ id: confirmDelete }}
          confirmLabel={t("vault.delete")}
          onConfirm={() => {
            const id = confirmDelete;
            setConfirmDelete(null);
            void doDelete(id);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmRemove && (
        <ConfirmDialog
          messageKey="vault.removeProviderConfirm"
          messageVars={{ id: confirmRemove }}
          confirmLabel={t("vault.removeProvider")}
          onConfirm={() => {
            const id = confirmRemove;
            setConfirmRemove(null);
            void removeProvider(id);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
      {dialog && (
        <VaultProviderDialog draft={dialog} onClose={() => setDialog(null)} onSubmit={submitProvider} />
      )}
    </div>
  );
}
