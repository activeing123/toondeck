import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export type Candidate = {
  name: string;
  transport: string;
  command?: string;
  args?: string[];
  url?: string;
  sources: string[];
};

export function fetchDiscover(): Promise<{
  candidates: Candidate[];
  sources_scanned: number;
  total: number;
}> {
  return fetch("/api/mcp/discover").then((r) => r.json());
}

export function importServers(
  names: string[],
): Promise<{ imported: number; skipped: number }> {
  return fetch("/api/mcp/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  }).then((r) => r.json());
}

/** Scan agent configs for MCP servers and offer one-click import. */
export default function DiscoverPanel({
  configuredNames,
  onImported,
}: {
  configuredNames: string[];
  onImported: () => void;
}) {
  const { t } = useI18n();
  const [found, setFound] = useState<{
    candidates: Candidate[];
    sources_scanned: number;
  } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const scan = () => {
    setScanning(true);
    setMsg(null);
    fetchDiscover()
      .then((d) => {
        setFound(d);
        setPicked(new Set());
      })
      .finally(() => setScanning(false));
  };
  useEffect(scan, []);

  const togglePick = (name: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  const doImport = async (names: string[]) => {
    setImporting(true);
    try {
      const r = await importServers(names);
      setMsg(`+${r.imported} · ${r.skipped} skipped`);
      setPicked(new Set());
      onImported();
    } finally {
      setImporting(false);
    }
  };

  const configured = new Set(configuredNames);
  const fresh = (found?.candidates ?? []).filter((c) => !configured.has(c.name));
  // UX-B1: one click adopts every fresh candidate — no per-checkbox ritual
  const adoptAll = () => doImport(fresh.map((c) => c.name));

  return (
    <section className="glass rounded-deck p-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">🔍 {t("mcp.discover")}</h2>
        <button
          onClick={scan}
          disabled={scanning}
          className="rounded-deck border border-deck-line px-3 py-1 text-sm hover:bg-deck-panel2 disabled:opacity-40"
        >
          {scanning ? t("mcp.scanning") : t("common.refresh")}
        </button>
        {found && (
          <span className="text-xs text-deck-muted">
            {found.sources_scanned} sources scanned
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-sm text-led-ok">{msg}</span>}
          {fresh.length > 0 && (
            <button
              onClick={adoptAll}
              disabled={importing}
              className="rounded-deck bg-deck-accent px-3 py-1 text-sm font-semibold text-deck-bg disabled:opacity-40"
            >
              {importing ? t("mcp.importing") : t("mcp.adoptAll")} ({fresh.length})
            </button>
          )}
          {picked.size > 0 && (
            <button
              onClick={() => doImport([...picked])}
              disabled={importing}
              className="rounded-deck border border-deck-line px-3 py-1 text-sm hover:bg-deck-panel2 disabled:opacity-40"
            >
              {t("mcp.importSelected")} ({picked.size})
            </button>
          )}
        </div>
      </div>

      {fresh.length > 0 && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {fresh.map((c) => (
            <label
              key={c.name}
              className="flex items-center gap-2 border border-deck-line rounded-deck px-3 py-2 text-sm cursor-pointer hover:bg-deck-panel2"
            >
              <input
                type="checkbox"
                checked={picked.has(c.name)}
                onChange={() => togglePick(c.name)}
              />
              <span className="font-mono">{c.name}</span>
              <span className="text-xs text-deck-muted">
                {c.transport === "http" ? c.url : [c.command, ...(c.args ?? [])].join(" ")}
              </span>
              <span className="ml-auto flex gap-1">
                {c.sources.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-deck-line px-2 py-0.5 text-xs text-deck-muted"
                  >
                    {s}
                  </span>
                ))}
              </span>
            </label>
          ))}
        </div>
      )}
      {found && fresh.length === 0 && (
        <p className="mt-2 text-sm text-deck-muted">
          all discovered servers already configured ✓
        </p>
      )}
    </section>
  );
}

// shim removed — useI18n has a safe default context (t returns the key)
