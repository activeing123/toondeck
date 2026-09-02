import { useState } from "react";
import { requestSync, toggleTool, useMcpState, type SyncResult } from "./api";

function Led({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        on ? "bg-led-ok shadow-glow-ok" : "bg-deck-muted"
      }`}
    />
  );
}

export default function McpPanel() {
  const { state, error, busy, reload } = useMcpState();
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  const onSync = () => {
    setSyncing(true);
    requestSync()
      .then(setSyncResults)
      .finally(() => setSyncing(false));
  };

  const onToggle = (server: string, tool: string) =>
    toggleTool(server, tool).then(reload);

  if (error) return <p className="text-led-err">{error}</p>;
  if (!state) return <p className="text-deck-muted">loading deck…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          MCP <span className="text-deck-accent">{state.server_total}</span> servers
          {state.disabled_total > 0 && (
            <span className="ml-3 text-sm text-deck-muted">
              {state.disabled_total} tools off
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={reload}
            disabled={busy}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:bg-deck-panel2"
          >
            {busy ? "…" : "refresh"}
          </button>
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg hover:opacity-90"
          >
            {syncing ? "syncing…" : "sync all agents"}
          </button>
        </div>
      </div>

      {syncResults && (
        <div className="glass rounded-deck p-3 text-sm">
          {syncResults.map((r) => (
            <div key={r.agent} className="flex items-center gap-2">
              <Led on={r.ok} /> {r.agent}
              {r.error && <span className="text-led-err">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {state.servers.map((s) => (
          <section key={s.name} className="glass rounded-deck p-4">
            <div className="flex items-center gap-2">
              <Led on={true} />
              <h2 className="font-semibold">{s.name}</h2>
              <span className="ml-auto rounded-full border border-deck-line px-2 py-0.5 text-xs text-deck-muted">
                {s.transport}
              </span>
            </div>
            <p className="mt-2 font-mono text-xs text-deck-muted break-all">{s.target}</p>
            {(s.env_keys.length > 0 || s.header_keys.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.env_keys.map((k) => (
                  <span key={k} className="rounded bg-deck-panel2 px-1.5 py-0.5 text-xs">
                    🔑 {k}
                  </span>
                ))}
                {s.header_keys.map((k) => (
                  <span key={k} className="rounded bg-deck-panel2 px-1.5 py-0.5 text-xs">
                    🔑 {k}
                  </span>
                ))}
              </div>
            )}
            {s.disabled_tools.length > 0 && (
              <div className="mt-3 border-t border-deck-line pt-2">
                <p className="text-xs text-deck-muted mb-1">tools off — click to re-enable</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.disabled_tools.map((t) => (
                    <button
                      key={t}
                      onClick={() => onToggle(s.name, t)}
                      className="rounded-full border border-led-warn/50 px-2 py-0.5 text-xs hover:bg-deck-panel2"
                    >
                      {t} ⏻
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
