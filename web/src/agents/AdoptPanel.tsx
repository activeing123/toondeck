import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export type UnknownAgent = {
  label: string;
  config_files: string[];
  evidence: string;
};

export function fetchUnknown(): Promise<{
  unknown: UnknownAgent[];
  signatures: number;
}> {
  return fetch("/api/agents/discover").then((r) => r.json());
}

const LABEL_RE = /^[a-z0-9][a-z0-9_-]{1,30}$/;

/** Universal agent adoption: unknown MCP-carrying agents become draft adapters. */
export default function AdoptPanel({
  onAdopted,
}: {
  onAdopted: () => void;
}) {
  const { t } = useI18n();
  const [found, setFound] = useState<{
    unknown: UnknownAgent[];
    signatures: number;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);

  const scan = () => {
    setMsg(null);
    fetchUnknown().then(setFound);
  };
  useEffect(scan, []);

  const adopt = async (label: string) => {
    setAdopting(label);
    setMsg(null);
    try {
      const raw = (drafts[label] ?? "").trim();
      const launch_command = raw ? raw.split(/\s+/) : null;
      const r = await fetch("/api/agents/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, launch_command }),
      }).then((x) => x.json());
      if (r.ok) {
        scan();
        setMsg(`${t("agents.adopted")} ${label}`);
        onAdopted();
      } else {
        setMsg(`${label}: ${r.error ?? "failed"}`);
      }
    } finally {
      setAdopting(null);
    }
  };

  const fresh = (found?.unknown ?? []).filter((u) => LABEL_RE.test(u.label));

  return (
    <section className="glass rounded-deck p-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">🌐 {t("agents.discover")}</h2>
        <button
          onClick={scan}
          className="rounded-deck border border-deck-line px-3 py-1 text-sm hover:bg-deck-panel2"
        >
          {t("common.refresh")}
        </button>
        {found && (
          <span className="text-xs text-deck-muted">
            {found.signatures} signatures · {fresh.length} unknown
          </span>
        )}
        {msg && <span className="ml-auto text-sm text-led-ok">{msg}</span>}
      </div>

      {fresh.length > 0 && (
        <div className="mt-3 space-y-2">
          {fresh.map((u) => (
            <div
              key={u.label}
              className="flex flex-wrap items-center gap-2 border border-deck-line rounded-deck px-3 py-2 text-sm"
            >
              <span className="font-mono">{u.label}</span>
              <span className="text-xs text-deck-muted">{u.evidence}</span>
              <span className="text-xs text-deck-muted truncate max-w-60">
                {u.config_files[0]}
              </span>
              <input
                role="textbox"
                value={drafts[u.label] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [u.label]: e.target.value }))
                }
                placeholder={t("agents.launchCmd")}
                className="w-56 rounded-deck border border-deck-line bg-deck-panel px-2 py-1 font-mono text-xs"
              />
              <button
                onClick={() => adopt(u.label)}
                disabled={adopting === u.label}
                className="ml-auto rounded-deck bg-deck-accent px-3 py-1 text-sm font-semibold text-deck-bg disabled:opacity-40"
              >
                {t("agents.adopt")}
              </button>
              <button
                onClick={() =>
                  setDrafts((d) => ({ ...d, [u.label]: `${u.label} --version` }))
                }
                className="rounded-deck border border-deck-line px-2 py-1 text-xs hover:bg-deck-panel2"
              >
                {t("agents.probe")}
              </button>
            </div>
          ))}
        </div>
      )}
      {found && fresh.length === 0 && (
        <p className="mt-2 text-sm text-deck-muted">
          {t("agents.noUnknown")}
        </p>
      )}
    </section>
  );
}
