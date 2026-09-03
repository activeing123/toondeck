import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { toast } from "../ui/Toast";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ZeroState } from "../ui/ZeroState";

type ProviderRow = {
  id: string;
  display_name: string;
  env_var: string;
  local: boolean;
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
      if (!r.ok) toast.error(r.error ?? "store failed");
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
      if (!r.ok && r.error) toast.error(`probe failed: ${r.error}`);
      else if (r.ok) toast.ok(t("vault.stored"));
      await load();
    } finally {
      setBusy(null);
    }
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

      {providers.length === 0 ? (
        <ZeroState icon="🔐" titleKey="vault.emptyTitle" hintKey="vault.emptyHint" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers.map((p) => (
          <section key={p.id} className="glass rounded-deck p-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  p.local ? "bg-led-ok" : p.stored ? "bg-led-ok shadow-glow-ok" : "bg-deck-muted"
                }`}
              />
              <h2 className="font-semibold">{p.display_name}</h2>
              <span className="ml-auto font-mono text-xs text-deck-muted">{p.env_var}</span>
            </div>

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
    </div>
  );
}
