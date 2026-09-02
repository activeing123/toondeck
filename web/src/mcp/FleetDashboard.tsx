import { useEffect, useState } from "react";

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

function Big({ n, label, sub }: { n: number | string; label: string; sub?: string }) {
  return (
    <div className="glass rounded-deck p-4 min-w-36">
      <div className="text-3xl font-mono font-bold text-deck-accent">{n}</div>
      <div className="mt-1 text-sm">{label}</div>
      {sub && <div className="text-xs text-deck-muted">{sub}</div>}
    </div>
  );
}

/** MCP 页旗舰仪表盘：mcptoon 管理了什么、从哪来、通不通。 */
export default function FleetDashboard() {
  const [o, setO] = useState<Overview | null>(null);
  const [engine, setEngine] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fleet/overview")
      .then((r) => r.json())
      .then(setO)
      .catch(() => setO(null));
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setEngine(h.engine?.version ?? null))
      .catch(() => setEngine(null));
  }, []);

  if (!o?.mcptoon) return null;
  const m = o.mcptoon;

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
        <Big n={m.servers_total} label="MCP servers 已接管" sub={`另发现 ${m.discovered_total} 个待收编`} />
        <Big n={m.tools_cached} label="工具总数（缓存）" sub={`${m.disabled_tools} 个已停用`} />
        <Big n={`${o.agents.installed}/${o.agents.total}`} label="CLI agents" sub={`${o.agents.cli_capable} 个可一键启动`} />
        <Big n={`${o.skills.valid}/${o.skills.total}`} label="技能" sub={`视图 ${o.skills.views_ok}/${o.skills.views_total} 健康`} />
      </div>

      <div className="text-xs text-deck-muted space-y-1">
        <div>
          来源（{m.sources_scanned} 个配置源已扫）：
          {Object.entries(m.sources_breakdown).map(([srv, srcs]) => (
            <span key={srv} className="ml-2 rounded-full border border-deck-line px-2 py-0.5">
              {srv} ← {srcs.join(", ")}
            </span>
          ))}
        </div>
        <div className="font-mono break-all">single source of truth: {m.config_path}</div>
      </div>
    </section>
  );
}
