import { useCallback, useEffect, useState } from "react";
import State from "../ui/State";
import { useI18n } from "../i18n";

type Inventory = {
  checked: number;
  adopted_total: number;
  discovered_total: number;
  tools_total: number;
  by_source: Record<string, number>;
  probed_at: number;
};

type Overview = {
  mcptoon: {
    servers_total: number;
    tools_cached: number;
    disabled_tools: number;
    discovered_total: number;
    sources_scanned: number;
    sources_breakdown: Record<string, string[]>;
    config_path: string;
  };
  agents: { total: number; installed: number; cli_capable: number };
  skills: { total: number; valid: number; views_ok: number; views_total: number };
};

/** R41: a stat you can see is a stat you want to manage — optional href
 * (route jump) or onClick (in-page scroll) turns the number into the entry
 * point of the panel that owns it. */
function Big({
  n,
  label,
  sub,
  accent,
  href,
  onClick,
}: {
  n: number | string;
  label: string;
  sub?: string;
  accent?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className={`text-3xl font-mono font-bold ${accent ? "text-deck-accent" : "text-deck-accent"}`}>{n}</div>
      <div className="mt-1 text-sm">{label}</div>
      {sub && <div className="text-xs text-deck-muted">{sub}</div>}
    </>
  );
  const cls = "glass rounded-deck p-4 min-w-36 text-left";
  if (href) {
    return (
      <a href={href} className={`${cls} hover:border-deck-accent/50 transition`}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} hover:border-deck-accent/50 transition`}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** MCP 页旗舰仪表盘：mcptoon 管理了什么、从哪来、通不通。 */
export default function FleetDashboard({ reloadSignal = 0 }: { reloadSignal?: number }) {
  const { t } = useI18n();
  const [o, setO] = useState<Overview | null>(null);
  const [oErr, setOErr] = useState(false);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [invLoading, setInvLoading] = useState(true);
  const [engine, setEngine] = useState<string | null>(null);

  const loadInventory = (refresh: boolean) => {
    setInvLoading(true);
    fetch(`/api/mcp/tools${refresh ? "?refresh=1" : ""}`)
      .then((r) => r.json())
      .then((d: Inventory) => setInv(d))
      .catch(() => setInv(null))
      .finally(() => setInvLoading(false));
  };

  const loadOverview = useCallback(() => {
    setOErr(false);
    fetch("/api/fleet/overview")
      .then((r) => r.json())
      .then(setO)
      .catch(() => setOErr(true));
  }, []);

  useEffect(() => {
    loadOverview();
    loadInventory(false);
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setEngine(h.engine?.version ?? null))
      .catch(() => setEngine(null));
  }, [loadOverview]);

  // UX-B2: the standalone "重新全量探测" button is gone — the page-level
  // refresh bumps reloadSignal, which re-probes the inventory right here.
  useEffect(() => {
    if (reloadSignal > 0) loadInventory(true);
  }, [reloadSignal]);

  if (!o?.mcptoon) {
    return (
      <State
        loading={!oErr}
        unreachable={oErr}
        onRetry={oErr ? loadOverview : undefined}
      >
        <span />
      </State>
    );
  }
  const m = o.mcptoon;
  const totalTools = inv?.tools_total ?? m.tools_cached;
  const bySource = inv?.by_source ?? {};
  // N-round2: chips count tools PER SOURCE (a tool reachable from two agents
  // appears twice); the hero counts UNIQUE tools. When a newcomer adds the
  // chips and gets a bigger number, say so in one line instead of letting
  // the math quietly disagree.
  const chipSum = Object.values(bySource).reduce((a, b) => a + b, 0);
  const chipSumAbove = chipSum > totalTools;

  return (
    <section data-testid="fleet-dashboard" className="glass rounded-deck p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">{t("fleet.overview")}</h2>
        {engine && (
          <span className="rounded-full border border-deck-line px-2 py-0.5 text-xs text-deck-muted">
            engine v{engine}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {/* R52 (P2): the capabilities total is clickable too — it summarizes
            tools + skills + agents, so it jumps to the deck home hub that
            owns all three. No more static big number. */}
        <Big
          n={invLoading ? "…" : totalTools + o.skills.valid + o.agents.installed}
          label={t("fleet.capabilities")}
          sub={
            invLoading
              ? t("fleet.probing")
              : t("fleet.summary", { tools: totalTools, skills: o.skills.valid, agents: o.agents.installed })
          }
          href="#/"
        />
        <Big
          n={invLoading ? "…" : totalTools}
          label={t("fleet.mcpTools")}
          sub={
            inv
              ? t("fleet.adoptedSub", { a: inv.adopted_total, d: inv.discovered_total })
              : t("fleet.firstScan")
          }
          accent
          // R52: the old #tools-browser anchor died with the R47 IA change
          onClick={() => document.getElementById("server-table")?.scrollIntoView({ behavior: "smooth" })}
        />
        <Big
          n={`${o.skills.valid}`}
          label={t("fleet.skills")}
          sub={t("fleet.skillsSub", { total: o.skills.total, ok: o.skills.views_ok, views: o.skills.views_total })}
          href="#/skills"
        />
        <Big
          n={`${o.agents.installed}/${o.agents.total}`}
          label="CLI agents"
          sub={t("fleet.launchable", { n: o.agents.cli_capable })}
          href="#/agents"
        />
      </div>

      {Object.keys(bySource).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-deck-muted">
          <span>{t("fleet.bySource")}</span>
          {Object.entries(bySource).map(([src, n]) => (
            <span key={src} className="rounded-full border border-deck-line px-2 py-0.5">
              {src} · {n} {t("fleet.tools")}
            </span>
          ))}
          {chipSumAbove && (
            <span data-testid="by-source-note">{t("fleet.dedupNote", { sum: chipSum, total: totalTools })}</span>
          )}
        </div>
      )}

      {/* P0-2 (R49): the sources chips + config path must wrap at narrow
          widths — this row was the 893px horizontal-overflow culprit. */}
      <div className="flex flex-col gap-2 text-xs text-deck-muted">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="whitespace-nowrap">{t("fleet.sourcesScanned", { n: m.sources_scanned })}</span>
          {Object.entries(m.sources_breakdown).map(([srv, srcs]) => (
            <span key={srv} className="rounded-full border border-deck-line px-2 py-0.5 max-w-full truncate">
              {srv} ← {srcs.join(", ")}
            </span>
          ))}
        </div>
        <div className="font-mono text-xs text-deck-muted break-all min-w-0">{t("fleet.sot", { path: m.config_path })}</div>
      </div>
    </section>
  );
}
