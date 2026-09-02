import { useEffect, useState } from "react";
import LogTerminal from "../agents/LogTerminal";

type StatusRow = { state: string; exit_code: number | null; pid?: number };
type AgentRow = { id: string; display_name: string; installed: boolean };

/** 全局日志中心：每个 agent 的实时日志 + 一键下载诊断报告。 */
export default function LogsPanel() {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/agents/status").then((r) => r.json()),
    ])
      .then(([a, s]) => {
        setAgents(a.agents);
        setStatuses(s);
      })
      .catch(() => setAgents([]));
  }, []);

  if (!agents) return <p className="text-deck-muted">loading deck…</p>;
  const launched = agents.filter((a) => statuses[a.id]);
  const never = agents.filter((a) => !statuses[a.id]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        📜 Logs
        <span className="ml-3 text-sm text-deck-muted">
          实时日志 · 下载 md 报告直接丢给任意 agent 自修
        </span>
      </h1>

      {launched.length > 0 && (
        <div className="space-y-3">
          {launched.map((a) => {
            const st = statuses[a.id];
            return (
              <section key={a.id} className="glass rounded-deck p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      st.state === "running"
                        ? "bg-led-ok shadow-glow-ok"
                        : "bg-led-err shadow-glow-err"
                    }`}
                  />
                  <h2 className="font-semibold">{a.display_name}</h2>
                  <span className="text-xs text-deck-muted">
                    {st.state === "running" ? `运行中 · pid ${st.pid}` : `已退出 · code ${st.exit_code}`}
                  </span>
                  <a
                    href={`/api/agents/${a.id}/logs/download`}
                    download
                    className="ml-auto rounded-deck border border-deck-line px-2.5 py-1 text-xs hover:bg-deck-panel2"
                  >
                    ⬇ 下载 md 报告
                  </a>
                  <button
                    onClick={() => setOpen(open === a.id ? null : a.id)}
                    className="rounded-deck border border-deck-line px-2.5 py-1 text-xs hover:bg-deck-panel2"
                  >
                    {open === a.id ? "收起" : "实时日志"}
                  </button>
                </div>
                {open === a.id && (
                  <div className="mt-3 border border-deck-line rounded-deck p-2 bg-black/40">
                    <LogTerminal agentId={a.id} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {never.length > 0 && (
        <p className="text-sm text-deck-muted">
          未启动过的 agent：{never.map((a) => a.display_name).join("、")} — 去 Agents 页一键启动后，
          日志会出现在这里。
        </p>
      )}
      {launched.length === 0 && (
        <p className="text-sm text-deck-muted">
          还没有任何日志 — 启动一个 agent（Agents 页）或跑一次 MCP 体检后再来。
        </p>
      )}
    </div>
  );
}
