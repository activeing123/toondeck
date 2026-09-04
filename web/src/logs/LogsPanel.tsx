import { useEffect, useState } from "react";
import LogTerminal from "../agents/LogTerminal";
import { useI18n } from "../i18n";
import { Led } from "../ui/Led";
import HowTo from "../ui/HowTo";

type StatusRow = { state: string; exit_code: number | null; pid?: number };
type AgentRow = { id: string; display_name: string; installed: boolean };
type JournalEntry = { ts: string; event: string; ok?: boolean; agent?: string; name?: string; provider?: string; label?: string };

/** Human label per journal event type; unknown types degrade to their raw name. */
const ACT_LABEL: Record<string, string> = {
  "mcp.health": "logs.actHealth",
  "mcp.sync": "logs.actSync",
  "skills.sync": "logs.actSkillsSync",
  "skills.sync_one": "logs.actSkillsSyncOne",
  "agent.launch": "logs.actLaunch",
  "agent.stop": "logs.actStop",
  "vault.probe": "logs.actProbe",
  "agent.adopt": "logs.actAdopt",
};

/** One-line subject of the event (which agent / skill / provider), if any. */
function actSubject(e: JournalEntry): string | null {
  return e.agent ?? e.name ?? e.provider ?? e.label ?? null;
}

/** 全局日志中心：deck 活动账本（R45）+ 每个 agent 的实时管道日志 + 一键下载诊断报告。 */
export default function LogsPanel() {
  const { t } = useI18n();
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [activity, setActivity] = useState<JournalEntry[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/agents/status").then((r) => r.json()),
      fetch("/api/activity").then((r) => r.json()),
    ])
      .then(([a, s, act]) => {
        setAgents(a.agents);
        setStatuses(s);
        setActivity(act.events ?? []);
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
        <span className="ml-3 text-sm text-deck-muted">{t("logs.subtitle")}</span>
      </h1>

      {/* R54: tutorial — the journal is automatic; md report is the help exit */}
      <HowTo page="logs" steps={[t("howto.logs.1"), t("howto.logs.2")]} />

      {activity && (
        <section className="glass rounded-deck p-4" data-testid="activity-journal">
          <div className="flex items-baseline gap-3">
            <h2 className="font-semibold">{t("logs.activityTitle")}</h2>
            <span className="text-xs text-deck-muted">{t("logs.activityHint")}</span>
          </div>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-deck-muted">{t("logs.actEmpty")}</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm max-h-80 overflow-y-auto">
              {activity.slice(0, 50).map((e, i) => {
                const labelKey = ACT_LABEL[e.event] ?? null;
                const subject = actSubject(e);
                return (
                  <li key={`${e.ts}-${i}`} className="flex items-center gap-2">
                    <Led
                      tone={e.ok === false ? "err" : "ok"}
                      label={`${e.event}: ${e.ok === false ? t("logs.actFail") : t("logs.actOk")}`}
                    />
                    <span className="font-mono text-xs text-deck-muted shrink-0">
                      {new Date(e.ts).toLocaleString()}
                    </span>
                    <span>{labelKey ? t(labelKey) : e.event}</span>
                    {subject && (
                      <span className="font-mono text-xs text-deck-accent">{subject}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {launched.length > 0 && (
        <div className="space-y-3">
          {launched.map((a) => {
            const st = statuses[a.id];
            return (
              <section key={a.id} className="glass rounded-deck p-4">
                <div className="flex items-center gap-2">
                  <Led
                    tone={st.state === "running" ? "ok" : "err"}
                    label={`${a.display_name}: ${t(st.state === "running" ? "led.running" : "led.exited")}`}
                  />
                  <h2 className="font-semibold">{a.display_name}</h2>
                  <span className="text-xs text-deck-muted">
                    {st.state === "running"
                      ? t("logs.running", { pid: st.pid ?? "?" })
                      : t("logs.exited", { code: st.exit_code ?? "?" })}
                  </span>
                  <a
                    href={`/api/agents/${a.id}/logs/download`}
                    download
                    className="ml-auto rounded-deck border border-deck-line px-2.5 py-1 text-xs hover:bg-deck-panel2"
                  >
                    {t("logs.downloadMd")}
                  </a>
                  <button
                    onClick={() => setOpen(open === a.id ? null : a.id)}
                    className="rounded-deck border border-deck-line px-2.5 py-1 text-xs hover:bg-deck-panel2"
                  >
                    {open === a.id ? t("logs.collapse") : t("logs.live")}
                  </button>
                </div>
                {open === a.id && (
                  <div className="mt-3 border border-deck-line rounded-deck p-2 bg-black/40">
                    {/* R32: the Logs center opts into the filter view */}
                    <LogTerminal agentId={a.id} filterable />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {never.length > 0 && (
        <p className="text-sm text-deck-muted">
          {t("logs.never", { names: never.map((a) => a.display_name).join(", ") })}
        </p>
      )}
      {launched.length === 0 && (
        <p className="text-sm text-deck-muted">{t("logs.empty")}</p>
      )}
    </div>
  );
}
