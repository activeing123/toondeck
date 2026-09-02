import { useEffect, useState } from "react";

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

function Big({ n, label, sub, accent }: { n: number | string; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className="glass rounded-deck p-4 min-w-36">
      <div className={`text-3xl font-mono font-bold ${accent ? "text-deck-accent" : "text-deck-accent"}`}>{n}</div>
      <div className="mt-1 text-sm">{label}</div>
      {sub && <div className="text-xs text-deck-muted">{sub}</div>}
    </div>
  );
}

/** MCP 页旗舰仪表盘：mcptoon 管理了什么、从哪来、通不通。 */
export default function FleetDashboard() {
  const [o, setO] = useState<Overview | null>(null);
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

  useEffect(() => {
    fetch("/api/fleet/overview")
      .then((r) => r.json())
      .then(setO)
      .catch(() => setO(null));
    loadInventory(false);
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setEngine(h.engine?.version ?? null))
      .catch(() => setEngine(null));
  }, []);

  if (!o?.mcptoon) return null;
  const m = o.mcptoon;
  const totalTools = inv?.tools_total ?? m.tools_cached;
  const bySource = inv?.by_source ?? {};

  return (
    <section className="glass rounded-deck p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">🚀 mcptoon 舰队总览</h2>
        {engine && (
          <span className="rounded-full border border-deck-line px-2 py-0.5 text-xs text-deck-muted">
            engine v{engine}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="glass rounded-deck p-4 min-w-52 border border-deck-accent/40">
          <div className="text-4xl font-mono font-bold text-deck-accent">
            {invLoading ? "…" : totalTools + o.skills.valid + o.agents.installed}
          </div>
          <div className="mt-1 text-sm font-semibold">个能力，全部由 mcptoon 统一管理</div>
          <div className="text-xs text-deck-muted">
            {invLoading ? "全量实探中…" : `${totalTools} MCP 工具 + ${o.skills.valid} 技能 + ${o.agents.installed} CLI agents`}
          </div>
        </div>
        <Big
          n={invLoading ? "…" : totalTools}
          label="MCP 工具（全量实探）"
          sub={
            inv
              ? `${inv.adopted_total} 已接管 · ${inv.discovered_total} 发现待收编`
              : "首次全量扫描约 10-30 秒"
          }
          accent
        />
        <Big n={`${o.skills.valid}`} label="技能（含 gbrain/jiyi 等）" sub={`${o.skills.total} 总数 · 视图 ${o.skills.views_ok}/${o.skills.views_total} 健康`} />
        <Big n={`${o.agents.installed}/${o.agents.total}`} label="CLI agents" sub={`${o.agents.cli_capable} 个可一键启动`} />
      </div>

      {Object.keys(bySource).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-deck-muted">
          <span>工具来源：</span>
          {Object.entries(bySource).map(([src, n]) => (
            <span key={src} className="rounded-full border border-deck-line px-2 py-0.5">
              {src} · {n} 工具
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-deck-muted">
        <div>
          来源（{m.sources_scanned} 个配置源已扫）：
          {Object.entries(m.sources_breakdown).map(([srv, srcs]) => (
            <span key={srv} className="ml-2 rounded-full border border-deck-line px-2 py-0.5">
              {srv} ← {srcs.join(", ")}
            </span>
          ))}
        </div>
        <button
          onClick={() => loadInventory(true)}
          disabled={invLoading}
          className="ml-auto rounded-deck border border-deck-line px-2.5 py-1 hover:bg-deck-panel2 disabled:opacity-40"
        >
          {invLoading ? "探测中…" : "↻ 重新全量探测"}
        </button>
      </div>
      <div className="font-mono text-xs text-deck-muted break-all">single source of truth: {m.config_path}</div>
    </section>
  );
}
