import { useCallback, useEffect, useState } from "react";
import LogTerminal from "./LogTerminal";

type AgentRow = {
  id: string;
  display_name: string;
  installed: boolean;
  evidence: Record<string, boolean>;
  config_paths: Record<string, boolean>;
  launch_command: string[] | null;
};

type StatusRow = {
  state: "never" | "running" | "exited";
  exit_code: number | null;
  pid?: number;
  logs: string[];
};

export default function AgentsPanel() {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({});
  const [openLogs, setOpenLogs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/agents/status").then((r) => r.json()),
    ]);
    setAgents(a.agents);
    setStatuses(s);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "launch" | "stop") => {
    setBusy(true);
    try {
      const r = await fetch(`/api/agents/${id}/${action}`, { method: "POST" }).then((r2) => r2.json());
      if (!r.ok) window.alert(r.error ?? "action failed");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!agents) return <p className="text-deck-muted">loading deck…</p>;
  const running = Object.values(statuses).filter((s) => s.state === "running").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Agents <span className="text-deck-accent">{agents.length}</span>
        <span className="ml-3 text-sm text-deck-muted">
          {agents.filter((a) => a.installed).length} installed · {running} running
        </span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map((a) => {
          const st = statuses[a.id] ?? { state: "never", exit_code: null, logs: [] };
          const canLaunch = a.installed && a.launch_command != null;
          return (
            <section key={a.id} className="glass rounded-deck p-4">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    st.state === "running"
                      ? "bg-led-ok shadow-glow-ok"
                      : st.state === "exited"
                        ? "bg-led-warn"
                        : a.installed
                          ? "bg-deck-muted"
                          : "bg-deck-muted opacity-40"
                  }`}
                />
                <h2 className="font-semibold">{a.display_name}</h2>
                <span className="ml-auto text-xs text-deck-muted">
                  {st.state === "running"
                    ? `running · pid ${st.pid}`
                    : st.state === "exited"
                      ? `exited · code ${st.exit_code}`
                      : a.installed
                        ? "not launched"
                        : "not installed"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {Object.entries(a.evidence).map(([k, v]) => (
                  <span
                    key={k}
                    className={`rounded px-1.5 py-0.5 font-mono ${
                      v ? "bg-deck-panel2 text-deck-ink" : "bg-transparent border border-deck-line text-deck-muted line-through"
                    }`}
                  >
                    {k}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => act(a.id, "launch")}
                  disabled={busy || !canLaunch || st.state === "running"}
                  className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg disabled:opacity-40"
                  title={a.launch_command ? a.launch_command.join(" ") : "GUI-only agent"}
                >
                  launch
                </button>
                <button
                  onClick={() => act(a.id, "stop")}
                  disabled={busy || st.state !== "running"}
                  className="rounded-deck border border-deck-line px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  stop
                </button>
                <button
                  onClick={() => setOpenLogs(openLogs === a.id ? null : a.id)}
                  disabled={st.state === "never"}
                  className="rounded-deck border border-deck-line px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {openLogs === a.id ? "hide logs" : "logs"}
                </button>
              </div>

              {openLogs === a.id && st.state !== "never" && (
                <div className="mt-3 border border-deck-line rounded-deck p-2 bg-black/40">
                  <LogTerminal agentId={a.id} />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
