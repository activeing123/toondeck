import { useCallback, useEffect, useState } from "react";
import LogTerminal from "./LogTerminal";
import AdoptPanel from "./AdoptPanel";
import { useI18n } from "../i18n";

function useI18nSafe() {
  try {
    return useI18n();
  } catch {
    return { lang: "en" as const, setLang: () => {}, t: (k: string) => k };
  }
}

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
  const { t } = useI18nSafe();
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, { base_url?: string }>>({});
  const [newProfile, setNewProfile] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newKey, setNewKey] = useState("");
  const [openLogs, setOpenLogs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [a, s, m, p] = await Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/agents/status").then((r) => r.json()),
      fetch("/api/agents/models").then((r) => r.json()),
      fetch("/api/agents/profiles").then((r) => r.json()),
    ]);
    setAgents(a.agents);
    setStatuses(s);
    setModels(m.models ?? {});
    setSources(m.sources ?? {});
    setProfiles(p.profiles ?? {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const changeModel = async (id: string, model: string) => {
    setModels((p) => ({ ...p, [id]: model }));
    await fetch(`/api/agents/${id}/model`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model === "" ? null : model }),
    });
  };

  const changeSource = async (id: string, profile: string) => {
    setSources((p) => ({ ...p, [id]: profile }));
    await fetch(`/api/agents/${id}/source`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: profile === "" ? null : profile }),
    });
  };

  const addProfile = async () => {
    if (!newProfile.trim()) return;
    await fetch("/api/agents/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newProfile.trim(),
        base_url: newUrl.trim() || null,
        api_key: newKey || null,
      }),
    });
    setNewProfile("");
    setNewUrl("");
    setNewKey("");
    await load();
  };

  const removeProfile = async (name: string) => {
    await fetch(`/api/agents/profiles/${name}`, { method: "DELETE" });
    await load();
  };

  const act = async (id: string, action: "launch" | "stop") => {
    setBusy(true);
    setFlash((f) => ({ ...f, [id]: "" }));
    try {
      const r = await fetch(`/api/agents/${id}/${action}`, { method: "POST" }).then((r2) => r2.json());
      if (!r.ok) {
        window.alert(`${id}: ${r.error ?? "action failed"}`);
      } else if (action === "launch") {
        setFlash((f) => ({
          ...f,
          [id]:
            r.mode === "window"
              ? `🪟 ${t("agents.windowLaunched")} · pid ${r.pid}`
              : `${t("agents.running")} · pid ${r.pid}`,
        }));
        // quick-exit visibility: re-check shortly; auto-open logs with the reason
        setTimeout(async () => {
          await load();
          const s = await fetch("/api/agents/status").then((x) => x.json());
          if (s[id]?.state === "exited") {
            setFlash((f) => ({ ...f, [id]: `⚠ ${t("agents.exited")} code ${s[id].exit_code}` }));
            setOpenLogs(id);
          }
        }, 1500);
      }
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

      <details className="glass rounded-deck p-4 text-sm">
        <summary className="cursor-pointer font-semibold">
          🔌 API 模型源 ({Object.keys(profiles).length})
        </summary>
        <div className="mt-3 space-y-2">
          {Object.entries(profiles).map(([name, p]) => (
            <div key={name} className="flex items-center gap-2 text-xs">
              <b className="font-mono">{name}</b>
              {p.base_url && <span className="text-deck-muted font-mono">{p.base_url}</span>}
              <button
                onClick={() => removeProfile(name)}
                className="ml-auto text-deck-muted hover:text-led-err"
              >
                delete
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-deck-line">
            <input
              value={newProfile}
              onChange={(e) => setNewProfile(e.target.value)}
              placeholder="名称 (如 my-proxy)"
              className="rounded-deck border border-deck-line bg-deck-panel px-2 py-1 text-xs w-40"
            />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="Base URL (https://…/v1)"
              className="rounded-deck border border-deck-line bg-deck-panel px-2 py-1 text-xs w-56"
            />
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="API Key（进系统钥匙串）"
              type="password"
              className="rounded-deck border border-deck-line bg-deck-panel px-2 py-1 text-xs w-48"
            />
            <button
              onClick={addProfile}
              className="rounded-deck bg-deck-accent px-3 py-1 text-xs font-semibold text-deck-bg"
            >
              保存
            </button>
          </div>
        </div>
      </details>

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
                        ? "bg-led-err shadow-glow-err"
                        : a.installed
                          ? "bg-deck-muted"
                          : "bg-deck-muted opacity-40"
                  }`}
                />
                <h2 className="font-semibold">{a.display_name}</h2>
                <span className="ml-auto text-xs text-deck-muted">
                  {st.state === "running"
                    ? `${t("agents.running")} · pid ${st.pid}`
                    : st.state === "exited"
                      ? `${t("agents.exited")} · code ${st.exit_code}`
                      : a.installed
                        ? t("agents.notLaunched")
                        : t("agents.notInstalled")}
                </span>
              </div>
              {flash[a.id] && (
                <div className="mt-1.5 text-xs text-deck-muted">{flash[a.id]}</div>
              )}

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

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => act(a.id, "launch")}
                  disabled={busy || !canLaunch || st.state === "running"}
                  className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg disabled:opacity-40"
                  title={a.launch_command ? a.launch_command.join(" ") : "GUI-only agent"}
                >
                  {t("agents.launch")}
                </button>
                <button
                  onClick={() => act(a.id, "stop")}
                  disabled={busy || st.state !== "running"}
                  className="rounded-deck border border-deck-line px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {t("agents.stop")}
                </button>
                <button
                  onClick={() => setOpenLogs(openLogs === a.id ? null : a.id)}
                  disabled={st.state === "never"}
                  className="rounded-deck border border-deck-line px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {openLogs === a.id ? t("agents.hideLogs") : t("agents.logs")}
                </button>
                {st.state !== "never" && (
                  <a
                    href={`/api/agents/${a.id}/logs/download`}
                    download
                    title={t("agents.downloadLog")}
                    className="rounded-deck border border-deck-line px-2.5 py-1.5 text-sm hover:bg-deck-panel2"
                  >
                    ⬇ md
                  </a>
                )}
                {canLaunch && (
                  <>
                    <datalist id={`model-opts-${a.id}`}>
                      {["claude-sonnet-4-5", "gpt-5.2-codex", "deepseek-chat", "gemini-2.5-pro"].map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <input
                      list={`model-opts-${a.id}`}
                      value={models[a.id] ?? ""}
                      onChange={(e) => changeModel(a.id, e.target.value)}
                      placeholder={t("agents.model")}
                      className="ml-auto w-44 rounded-deck bg-deck-panel2 px-2.5 py-1.5 text-xs font-mono"
                    />
                    <select
                      value={sources[a.id] ?? ""}
                      onChange={(e) => changeSource(a.id, e.target.value)}
                      className="rounded-deck bg-deck-panel2 px-2 py-1.5 text-xs"
                      title="API 模型源"
                    >
                      <option value="">默认 API</option>
                      {Object.keys(profiles).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </>
                )}
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

      <AdoptPanel onAdopted={load} />
    </div>
  );
}
