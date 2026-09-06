import { useEffect, useState } from "react";
import FleetDashboard from "./FleetDashboard";
import StarterChecklist, { markChecklistDone } from "../ui/StarterChecklist";
import ServerTable, { buildRows } from "./ServerTable";
import { importServers } from "./DiscoverPanel";
import { HealthVerdict } from "./HealthVerdict";
import { useI18n } from "../i18n";
import { Led as SharedLed } from "../ui/Led";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ZeroState } from "../ui/ZeroState";
import HowTo from "../ui/HowTo";
import {
  checkHealth,
  fetchInventory,
  requestSync,
  toggleTool,
  useMcpState,
  type HealthResult,
  type InventoryData,
  type SyncResult,
} from "./api";

function Led({ on, label }: { on: boolean; label?: string }) {
  return <SharedLed tone={on ? "ok" : "off"} label={label} size="md" />;
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
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
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
  const [healthMeta, setHealthMeta] = useState<{ wallMs: number; timeoutS: number | null } | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { t } = useI18n();
  const [invReload, setInvReload] = useState(0);
  const [confirmSync, setConfirmSync] = useState(false);
  // R47: one inventory fetch feeds the unified table (was: ToolsBrowser
  // lazy-loaded it behind a click, so the page looked half-empty by default)
  const [inventory, setInventory] = useState<InventoryData | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInventory().then((d) => {
      if (alive) setInventory(d);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [invReload]);

  const onSync = () => {
    // UX-B4 + R26: name the blast radius in an in-app dialog (native confirm
    // is unstyled chrome); sync only proceeds on explicit confirm.
    setConfirmSync(true);
  };

  const onHealth = () => {
    setChecking(true);
    setHealth(null);
    setHealthErr(null);
    const t0 = performance.now();
    checkHealth()
      .then((b) => {
        setHealth(b.results);
        setHealthMeta({ wallMs: performance.now() - t0, timeoutS: b.timeout_s ?? null });
        markChecklistDone("health"); // N-R2: first-hour step sealed
      })
      .catch(() => setHealthErr(t("mcp.healthFailed")))
      .finally(() => setChecking(false));
  };

  if (error) return <p className="text-led-err">{error}</p>;
  if (!state) return <p className="text-deck-muted">loading deck…</p>;

  const sourceCount = state.servers.reduce(
    (acc, s) => {
      for (const src of s.sources ?? []) acc[src] = (acc[src] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
        {/* N-R2: the first-hour path — sealed steps tick themselves off */}
        <StarterChecklist />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">
            MCP{" "}
            <button
              type="button"
              data-testid="mcp-managed-count"
              onClick={() => document.getElementById("server-table")?.scrollIntoView({ behavior: "smooth" })}
              className="text-deck-accent underline decoration-dotted underline-offset-4 cursor-pointer"
              aria-label={t("fleet.mcpTools")}
            >
              {state.server_total}
            </button>{" "}
            servers
            {state.disabled_total > 0 && (
              <span className="ml-3 text-sm text-deck-muted">
                {state.disabled_total} tools off
              </span>
            )}
          </h1>
          <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              reload();
              setInvReload((x) => x + 1); // UX-B2: one refresh = state + full re-probe
            }}
            disabled={busy}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:bg-deck-panel2"
          >
            {busy ? "…" : t("common.refresh")}
          </button>
          <button
            onClick={onHealth}
            disabled={checking}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:bg-deck-panel2"
          >
            {checking ? t("fleet.probing") : t("mcp.healthBtn")}
          </button>
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg hover:opacity-90"
          >
            {syncing ? t("mcp.syncing") : t("skills.syncAll")}
          </button>
        </div>
      </div>

      <FleetDashboard reloadSignal={invReload} />

      {/* R54: the tutorial answers the two newcomer questions up front */}
      <HowTo
        page="mcp"
        steps={[t("howto.mcp.1"), t("howto.mcp.2"), t("howto.mcp.3")]}
      />

      <TokenCard ts={state.token_savings} />

      {(() => {
        const managed = state.servers;
        const invServers = inventory?.servers ?? [];
        const discovered = invServers.filter((s) => !managed.some((m) => m.name === s.server));
        const rows = buildRows(managed, invServers, health);
        return (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-deck-muted">{t("mcp.takeoverSources")}</span>
              {Object.entries(sourceCount).map(([src, n]) => (
                <span key={src} className="rounded-full border border-deck-line px-2.5 py-1">
                  <b>{src}</b> · {n}
                </span>
              ))}
              <span className="ml-auto text-deck-muted min-w-0">
                {t("mcp.universe", { managed: managed.length, discovered: discovered.length })} ·{" "}
                <button
                  type="button"
                  data-testid="mcp-tools-count"
                  onClick={() => document.getElementById("server-table")?.scrollIntoView({ behavior: "smooth" })}
                  className="underline decoration-dotted underline-offset-4 cursor-pointer"
                  aria-label={t("mcp.managedTools", { n: state.servers.reduce((n, s) => n + s.tool_total, 0) })}
                >
                  {t("mcp.managedTools", { n: state.servers.reduce((n, s) => n + s.tool_total, 0) })}
                </button>
              </span>
            </div>

            {rows.length === 0 ? (
              <ZeroState
                icon="🔌"
                titleKey="mcp.emptyTitle"
                hintKey="mcp.emptyHint"
                ctaHref="#/agents"
                ctaLabelKey="common.ctaGoAgents"
              />
            ) : (
              <ServerTable
                rows={rows}
                onToggle={(server, tool) => toggleTool(server, tool).then(reload)}
                onAdopt={(name) =>
                  importServers([name])
                    .then(() => reload())
                    .then(() => setInvReload((x) => x + 1))
                }
              />
            )}
          </>
        );
      })()}

      {healthErr && (
        <div className="glass rounded-deck p-3 text-sm text-led-err">
          {healthErr}
        </div>
      )}

      {health && healthMeta && (
        <HealthVerdict
          results={health}
          wallMs={healthMeta.wallMs}
          timeoutS={healthMeta.timeoutS}
          onRerun={onHealth}
          summaryOnly
        />
      )}

      {syncResults && (
        <div className="glass rounded-deck p-3 text-sm">
          {syncResults.map((r) => (
            <div key={r.agent} className="flex items-center gap-2">
              <Led on={r.ok} label={`${r.agent}: ${t(r.ok ? "led.ok" : "led.err")}`} /> {r.agent}
              {r.error && <span className="text-led-err">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {confirmSync && (
        <ConfirmDialog
          messageKey="mcp.syncWarn"
          confirmLabel={t("mcp.syncConfirm")}
          onConfirm={() => {
            setConfirmSync(false);
            setSyncing(true);
            requestSync()
              .then((r) => {
                setSyncResults(r);
                if (r) markChecklistDone("sync"); // N-R2: first-hour step sealed
              })
              .finally(() => setSyncing(false));
          }}
          onCancel={() => setConfirmSync(false)}
        />
      )}
    </div>
  );
}
