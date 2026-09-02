import { useState } from "react";
import DiscoverPanel from "./DiscoverPanel";
import {
  checkHealth,
  requestSync,
  toggleTool,
  useMcpState,
  type HealthResult,
  type SyncResult,
} from "./api";

function Led({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        on ? "bg-led-ok shadow-glow-ok" : "bg-deck-muted"
      }`}
    />
  );
}

function statusLed(status: string) {
  if (status === "ok") return "bg-led-ok shadow-glow-ok";
  if (status === "timeout") return "bg-led-warn";
  return "bg-led-err shadow-glow-err";
}

function TokenCard({ ts }: { ts: { method: string; tool_total: number; full_json_tokens: number; slim_tokens: number; saved_pct: number } }) {
  if (ts.tool_total === 0) {
    return (
      <div className="glass rounded-deck p-4 text-sm text-deck-muted">
        no cached tool inventory yet — run a health check to populate, then the token math shows up here.
      </div>
    );
  }
  return (
    <div className="glass rounded-deck p-4">
      <div className="text-xs text-deck-muted uppercase tracking-wide">context cost of your tool inventory</div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-2xl font-mono text-deck-muted line-through">{ts.full_json_tokens.toLocaleString()}</span>
        <span className="text-deck-muted">→</span>
        <span className="text-3xl font-mono font-bold text-deck-accent">{ts.slim_tokens.toLocaleString()}</span>
        <span className="text-led-ok font-semibold">-{ts.saved_pct}%</span>
      </div>
      <div className="mt-1 text-xs text-deck-muted">
        SLIM manifest vs full JSON · {ts.tool_total} tools · honest estimate ({ts.method})
      </div>
    </div>
  );
}

export default function McpPanel() {
  const { state, error, busy, reload } = useMcpState();
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [health, setHealth] = useState<HealthResult[] | null>(null);
  const [checking, setChecking] = useState(false);

  const onSync = () => {
    setSyncing(true);
    requestSync()
      .then(setSyncResults)
      .finally(() => setSyncing(false));
  };

  const onHealth = () => {
    setChecking(true);
    checkHealth()
      .then((b) => setHealth(b.results))
      .finally(() => setChecking(false));
  };

  const onToggle = (server: string, tool: string) =>
    toggleTool(server, tool).then(reload);

  if (error) return <p className="text-led-err">{error}</p>;
  if (!state) return <p className="text-deck-muted">loading deck…</p>;

  const healthBy = Object.fromEntries((health ?? []).map((h) => [h.server, h]));

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
            onClick={onHealth}
            disabled={checking}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:bg-deck-panel2"
          >
            {checking ? "probing…" : "run health check"}
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

      <TokenCard ts={state.token_savings} />

      <DiscoverPanel
        configuredNames={state.servers.map((s) => s.name)}
        onImported={reload}
      />

      {health && (
        <div className="glass rounded-deck p-3 text-sm">
          <p className="text-xs text-deck-muted mb-1">probed statuses below — live connections, just ran</p>
          {health.map((h) => (
            <div key={h.server} className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusLed(h.status)}`} />
              <span className="font-medium">{h.server}</span>
              <span className="text-deck-muted">{h.status}</span>
              <span className="ml-auto font-mono text-xs text-deck-muted">
                {h.tools} tools · {h.latency_ms}ms
              </span>
              {h.error && <span className="text-led-err text-xs">{h.error}</span>}
            </div>
          ))}
        </div>
      )}

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
        {state.servers.map((s) => {
          const h = healthBy[s.name];
          const led = h ? statusLed(h.status) : "bg-deck-muted";
          return (
            <section key={s.name} className="glass rounded-deck p-4">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${led}`} />
                <h2 className="font-semibold">{s.name}</h2>
                {s.tool_total > 0 && (
                  <span className="text-xs text-deck-muted">{s.tool_total} tools</span>
                )}
                {h && h.status === "ok" && (
                  <span className="ml-auto font-mono text-xs text-deck-muted">{h.latency_ms}ms</span>
                )}
                {!h && (
                  <span className="ml-auto rounded-full border border-deck-line px-2 py-0.5 text-xs text-deck-muted">
                    {s.transport}
                  </span>
                )}
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
          );
        })}
      </div>
    </div>
  );
}
