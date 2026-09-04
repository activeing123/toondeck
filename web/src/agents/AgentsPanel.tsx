import { useCallback, useEffect, useState } from "react";
import LogTerminal from "./LogTerminal";
import AdoptPanel from "./AdoptPanel";
import { ProviderDialog, type ProviderDraft } from "./ProviderDialog";
import { useI18n } from "../i18n";
import { toast } from "../ui/Toast";
import { ZeroState } from "../ui/ZeroState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import HowTo from "../ui/HowTo";
import { Led } from "../ui/Led";

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
  tui?: boolean;
  install_hint?: string | null;
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
  const [profiles, setProfiles] = useState<Record<string, { base_url?: string; keyring?: boolean }>>({});
  const [providers, setProviders] = useState<
    { id: string; display_name: string; base_url: string; models: string[]; keyless: boolean; configured: boolean }[]
  >([]);
  // R46: one dialog state replaces the three inline input states
  const [dialog, setDialog] = useState<ProviderDraft | null>(null);
  const [openLogs, setOpenLogs] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; action: "launch" | "stop" } | null>(null);
  // N-R5: an agent the user stopped on purpose is not a failure — remember
  // the stop so the exited card does not flash the self-fix loop.
  const [userStopped, setUserStopped] = useState<Set<string>>(new Set());
  const [unreachable, setUnreachable] = useState(false);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [cmdFor, setCmdFor] = useState<string | null>(null);
  const [cmdInput, setCmdInput] = useState("");
  // N-R11: one-shot model setup for every agent (novice ask: "普适所有 agent")
  const [bulkModel, setBulkModel] = useState("");
  const [bulkPending, setBulkPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s, m, p, pr] = await Promise.all([
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/agents/status").then((r) => r.json()),
        fetch("/api/agents/models").then((r) => r.json()),
        fetch("/api/agents/profiles").then((r) => r.json()),
        fetch("/api/agents/providers").then((r) => r.json()),
      ]);
      setAgents(a.agents);
      setStatuses(s);
      setModels(m.models ?? {});
      setSources(m.sources ?? {});
      setProfiles(p.profiles ?? {});
      setProviders(pr.providers ?? []);
      setUnreachable(false);
    } catch {
      // N-R9: a dead engine must read as DOWN, not as a slow spinner —
      // same honest card the skills page shows.
      setUnreachable(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // UX-B3: honest polling — refresh statuses every 10s, but only for
  // visible tabs (hidden tabs freeze until they come back)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10_000);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // UX-B5: GUI-only agents get a user-supplied launch command (adapters.d override)
  const addLaunchCommand = async (id: string) => {
    const cmd = cmdInput.trim();
    if (!cmd) return;
    await fetch(`/api/agents/${id}/launch-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    });
    setCmdFor(null);
    setCmdInput("");
    await load();
  };

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

  // N-R11: apply one model string to every agent — the string passes through
  // verbatim, so custom/OpenAI-compatible model names work untouched.
  const applyBulkModel = async (model: string) => {
    if (!agents) return;
    await Promise.all(agents.map((a) => changeModel(a.id, model)));
    setBulkPending(null);
    setBulkModel("");
    toast.ok(t("agents.bulkDone", { n: agents.length, model }));
  };

  const removeProfile = async (name: string) => {
    await fetch(`/api/agents/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
    await load();
  };

  // R46: dialog submit routes by mode — enable/custom POST (full entry),
  // edit PUT (merge: blank key keeps the stored one)
  const submitDialog = async (r: { name: string; baseUrl: string; apiKey: string; ok: boolean }) => {
    if (!dialog) return;
    const keyless = dialog.mode === "enable" && dialog.keyless;
    const res =
      dialog.mode === "edit"
        ? await fetch(`/api/agents/profiles/${encodeURIComponent(dialog.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              base_url: r.baseUrl || null,
              api_key: r.apiKey.trim() ? r.apiKey : null,
            }),
          }).then((x) => x.json())
        : await fetch("/api/agents/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: r.name,
              base_url: r.baseUrl || null,
              api_key: keyless ? null : r.apiKey || null,
            }),
          }).then((x) => x.json());
    if (!res.ok) {
      toast.error(res.error ?? "save failed");
      return;
    }
    setDialog(null);
    toast.ok(t("agents.sourceSaved"));
    await load();
  };

  const openEnable = (id: string) => {
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    setDialog({
      mode: "enable",
      id: p.id,
      displayName: p.display_name,
      baseUrl: p.base_url,
      hasStoredKey: false,
      keyless: p.keyless,
    });
  };

  const openEdit = (id: string) => {
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    const entry = profiles[id] ?? {};
    setDialog({
      mode: "edit",
      id: p.id,
      displayName: p.display_name,
      baseUrl: entry.base_url ?? p.base_url,
      hasStoredKey: entry.keyring === true,
      keyless: false,
    });
  };

  const openCustom = () => {
    setDialog({
      mode: "custom",
      id: "",
      displayName: t("agents.customSource"),
      baseUrl: "",
      hasStoredKey: false,
      keyless: false,
    });
  };

  const act = async (id: string, action: "launch" | "stop") => {
    // R27: per-agent pending state — the acting button shows a spinner and
    // this agent's buttons lock; OTHER agents stay fully usable (the backend
    // Manager lock serializes launch/stop, so cross-agent clicks are safe).
    setPending({ id, action });
    setFlash((f) => ({ ...f, [id]: "" }));
    try {
      const r = await fetch(`/api/agents/${id}/${action}`, { method: "POST" }).then((r2) => r2.json());
      if (!r.ok) {
        toast.error(`${id}: ${r.error ?? "action failed"}`);
      } else if (action === "launch") {
        setUserStopped((s) => {
          const n = new Set(s);
          n.delete(id); // a fresh launch clears any earlier manual stop
          return n;
        });
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
          if (s[id]?.state === "exited" && !userStopped.has(id)) {
            setFlash((f) => ({ ...f, [id]: `⚠ ${t("agents.exited")} code ${s[id].exit_code}` }));
            setOpenLogs(id);
          }
        }, 1500);
      } else if (action === "stop") {
        setUserStopped((s) => new Set(s).add(id));
        toast.ok(t("agents.stoppedOk"));
      }
      await load();
    } finally {
      setPending(null);
    }
  };

  if (unreachable)
    return (
      <div
        data-testid="agents-unreachable"
        className="glass rounded-deck p-4 text-sm space-y-1"
      >
        <p className="font-semibold text-led-err">{t("agents.unreachableTitle")}</p>
        <p className="text-deck-muted">{t("agents.unreachableHint")}</p>
        <button
          data-testid="agents-retry"
          onClick={load}
          className="rounded-deck border border-deck-line px-3 py-1 text-xs hover:bg-deck-panel2"
        >
          {t("common.refresh")}
        </button>
      </div>
    );
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

      {/* R54: tutorial — auto-detect, launch, vault keys flow in */}
      <HowTo
        page="agents"
        steps={[t("howto.agents.1"), t("howto.agents.2"), t("howto.agents.3")]}
      />

      {/* N-R11 (user ask): one-shot model setup for every agent — the model
          string passes through verbatim, so custom model names just work.
          Explicit confirm: this overwrites per-card choices. */}
      <div className="glass rounded-deck p-3 text-sm" data-testid="bulk-model">
        <p className="font-semibold">{t("agents.bulkTitle")}</p>
        <p className="mt-0.5 text-xs text-deck-muted">{t("agents.bulkHint")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <datalist id="bulk-model-opts">
            {["claude-sonnet-4-5", "gpt-5.2-codex", "deepseek-chat", "gemini-2.5-pro"].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <input
            data-testid="bulk-model-input"
            list="bulk-model-opts"
            value={bulkModel}
            onChange={(e) => setBulkModel(e.target.value)}
            placeholder={t("agents.bulkPlaceholder")}
            className="w-56 rounded-deck bg-deck-panel2 px-2.5 py-1.5 text-xs font-mono"
          />
          <button
            data-testid="bulk-apply"
            disabled={!bulkModel.trim()}
            onClick={() => setBulkPending(bulkModel.trim())}
            className="rounded-deck bg-deck-accent px-2.5 py-1.5 text-xs font-semibold text-deck-bg disabled:opacity-40"
          >
            {t("agents.bulkApply")}
          </button>
        </div>
      </div>

      {bulkPending != null && (
        <ConfirmDialog
          messageKey="agents.bulkConfirm"
          messageVars={{ n: agents.length, model: bulkPending }}
          confirmLabel={t("agents.bulkGo")}
          onConfirm={() => applyBulkModel(bulkPending)}
          onCancel={() => setBulkPending(null)}
        />
      )}

      {agents.length === 0 ? (
        <ZeroState icon="🤖" titleKey="agents.emptyTitle" hintKey="agents.emptyHint" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((a) => {
          const st = statuses[a.id] ?? { state: "never", exit_code: null, logs: [] };
          const canLaunch = a.installed && a.launch_command != null;
          return (
            <section key={a.id} className="glass rounded-deck p-4">
              <div className="flex items-center gap-2">
                <Led
                  tone={st.state === "running" ? "ok" : st.state === "exited" ? "err" : "off"}
                  size="md"
                  label={`${a.display_name}: ${t(
                    st.state === "running" ? "led.running" : st.state === "exited" ? "led.exited" : a.installed ? "led.installed" : "led.notInstalled",
                  )}`}
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
              {!a.installed && a.install_hint && (
                // N-R4: an uninstalled card was a dead end — no LED action,
                // no next step. The install command goes right on the card,
                // copyable, so the novice can paste it into any terminal.
                <p
                  data-testid={`install-hint-${a.id}`}
                  className="mt-1.5 text-xs text-deck-muted"
                >
                  {t("agents.installPre")}{" "}
                  <code className="rounded bg-deck-panel2 px-1.5 py-0.5 font-mono text-deck-accent select-all">
                    {a.install_hint}
                  </code>{" "}
                  {t("agents.installPost")}
                </p>
              )}
              {/* N-R5: only a real crash warrants the self-fix loop — a
                  user-initiated stop or a clean exit (code 0) is normal
                  lifecycle, not something to "fix". */}
              {st.state === "exited" && !userStopped.has(a.id) && st.exit_code !== 0 && (
                // N-R6: the mcptoon self-heal loop was invisible — a novice
                // saw "exited · code 1" and stopped there. Point at the md
                // report hand-off right on the failed card.
                <p
                  data-testid={`selffix-hint-${a.id}`}
                  className="mt-1.5 text-xs text-deck-muted"
                >
                  {t("agents.selffixPre")}{" "}
                  <a
                    href={`/api/agents/${a.id}/logs/download`}
                    download
                    className="text-deck-accent hover:underline"
                  >
                    {t("logs.downloadMd")}
                  </a>
                  {t("agents.selffixPost")}
                </p>
              )}

              {/* R51 (P1-2): the launch explanation used to live only in the
                  button's hover title (keyboard/touch users never saw it).
                  Persistent micro-copy: the actual command, or why the
                  launch button is disabled (GUI-only agent). */}
              {a.launch_command ? (
                <p
                  className="mt-2 truncate font-mono text-xs text-deck-muted"
                  data-testid={`launch-cmd-${a.id}`}
                >
                  $ {a.launch_command.join(" ")}
                </p>
              ) : a.installed ? (
                <p className="mt-2 text-xs text-deck-muted" data-testid={`gui-only-${a.id}`}>
                  {t("agents.guiOnlyHint")}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {/* 小白-4: detection evidence (exe:/dir: chips) is engineer
                    honesty, not newcomer reading — folded into a details
                    toggle so the card leads with state in plain words */}
                <details data-testid={`evidence-${a.id}`}>
                  <summary className="cursor-pointer text-deck-muted">
                    {t("agents.evidence")}
                  </summary>
                  <p className="mt-1.5 text-deck-muted">{t("agents.evidenceLegend")}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Object.entries(a.evidence).map(([k, v]) => {
                      // N-round2: "exe:claude" tokens are engineer honesty —
                      // speak them ("✓ 命令 claude") and show the ✓/✗ verdict
                      // with color, dropping the strike-through squint test.
                      const i = k.indexOf(":");
                      const kind = i === -1 ? k : k.slice(0, i);
                      const value = i === -1 ? "" : k.slice(i + 1);
                      const kindLabel =
                        kind === "dir" ? t("agents.evFolder") : t("agents.evCommand");
                      return (
                        <span
                          key={k}
                          className={`rounded px-1.5 py-0.5 ${
                            v
                              ? "bg-deck-panel2 text-deck-ink"
                              : "border border-deck-line text-deck-muted"
                          }`}
                        >
                          <span className={v ? "text-led-ok" : "text-led-err"}>
                            {v ? "✓" : "✗"}
                          </span>{" "}
                          {kindLabel} <code className="font-mono">{value}</code>
                        </span>
                      );
                    })}
                  </div>
                </details>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => act(a.id, "launch")}
                  disabled={!canLaunch || st.state === "running" || pending?.id === a.id}
                  className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg disabled:opacity-40"
                >
                  {pending?.id === a.id && pending.action === "launch" ? (
                    <>
                      <span
                        className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
                        aria-hidden
                      />
                      {t("agents.starting")}
                    </>
                  ) : (
                    t("agents.launch")
                  )}
                </button>
                {/* N-R3/N-R10: 停止 only exists while something is actually
                    running — disabled copies on exited cards read as noise. */}
                {st.state === "running" && (
                  <button
                    onClick={() => act(a.id, "stop")}
                    disabled={pending?.id === a.id}
                    className="rounded-deck border border-deck-line px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    {pending?.id === a.id && pending.action === "stop" ? (
                      <>
                        <span
                          className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
                          aria-hidden
                        />
                        {t("agents.stopping")}
                      </>
                    ) : (
                      t("agents.stop")
                    )}
                  </button>
                )}
                {st.state !== "never" && (
                  <button
                    onClick={() => setOpenLogs(openLogs === a.id ? null : a.id)}
                    className="rounded-deck border border-deck-line px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    {openLogs === a.id ? t("agents.hideLogs") : t("agents.logs")}
                  </button>
                )}
                {a.installed && a.launch_command == null && (
                  cmdFor === a.id ? (
                    <>
                      <input
                        data-testid={`${a.id}-cmd-input`}
                        value={cmdInput}
                        onChange={(e) => setCmdInput(e.target.value)}
                        placeholder={t("agents.launchCmd")}
                        autoFocus
                        className="rounded-deck border border-deck-line bg-deck-panel px-2 py-1.5 text-xs font-mono w-56"
                      />
                      <button
                        onClick={() => addLaunchCommand(a.id)}
                        disabled={!cmdInput.trim()}
                        className="rounded-deck bg-deck-accent px-2.5 py-1.5 text-xs font-semibold text-deck-bg disabled:opacity-40"
                      >
                        {t("agents.saveCmd")}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setCmdFor(a.id)}
                      className="rounded-deck border border-deck-line px-2.5 py-1.5 text-xs hover:bg-deck-panel2"
                    >
                      + {t("agents.addLaunchCmd")}
                    </button>
                  )
                )}
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
                  <span className="text-xs text-deck-muted whitespace-nowrap">{t("agents.sourceLabel")}</span>
                    <select
                      value={sources[a.id] ?? ""}
                      onChange={(e) => changeSource(a.id, e.target.value)}
                      className="rounded-deck bg-deck-panel2 px-2 py-1.5 text-xs"
                    >
                      <option value="">{t("agents.defaultApi")}</option>
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
                  {a.tui && st.state === "running" ? (
                    <p className="text-xs text-deck-muted px-1 py-2">{t("agents.windowLog")}</p>
                  ) : (
                    <LogTerminal agentId={a.id} />
                  )}
                </div>
              )}
            </section>
          );
        })}
        </div>
      )}

      {/* N-R2 (user ask): "新增模型很隐蔽" — this was a collapsed <details>
          with the add button buried inside. Now a persistent glass card:
          count badge up top (amber while nothing is enabled) and a header
          add button that opens the dialog without unfolding anything. */}
      <section className="glass rounded-deck p-4 text-sm" data-testid="provider-section">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{t("agents.providersTitle")}</h2>
          <span
            data-testid="provider-badge"
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              providers.some((p) => p.configured)
                ? "border border-led-ok/60 text-led-ok"
                : "bg-amber-400/20 text-amber-600 dark:text-amber-300"
            }`}
          >
            {providers.filter((p) => p.configured).length}/{providers.length}
          </span>
          <button
            onClick={openCustom}
            data-testid="provider-add-header"
            className="ml-auto rounded-deck border border-deck-line px-2.5 py-1 text-xs hover:bg-deck-panel2"
          >
            {t("agents.addSource")}
          </button>
        </div>
        {/* 小白-5: the benefit line — why enabling a provider matters */}
        <p className="mt-2 text-xs text-deck-muted" data-testid="providers-hint">
          {t("agents.providersHint")}
        </p>
        <div className="mt-3 space-y-2">
          {providers.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs border border-deck-line rounded-deck px-3 py-2">
              <b>{p.display_name}</b>
              <span className="text-deck-muted font-mono">
                {profiles[p.id]?.base_url ?? p.base_url}
              </span>
              <span className="text-deck-muted">{t("agents.modelsCount", { n: p.models.length })}</span>
              {p.configured && profiles[p.id]?.keyring && (
                <span className="text-led-ok">{t("agents.keyStoredChip")}</span>
              )}
              {p.configured ? (
                <>
                  <span className="text-led-ok">{t("agents.enabled")}</span>
                  <button
                    onClick={() => openEdit(p.id)}
                    data-testid={`provider-edit-${p.id}`}
                    className="ml-auto rounded-deck border border-deck-line px-2.5 py-1 hover:bg-deck-panel2"
                  >
                    {t("agents.editSource")}
                  </button>
                  <button onClick={() => removeProfile(p.id)} className="text-deck-muted hover:text-led-err">
                    {t("agents.disable")}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => openEnable(p.id)}
                  data-testid={`provider-enable-${p.id}`}
                  className="ml-auto rounded-deck bg-deck-accent px-2.5 py-1 font-semibold text-deck-bg"
                >
                  {p.keyless ? t("agents.enableKeyless") : t("agents.enable")}
                </button>
              )}
            </div>
          ))}

          <div className="pt-2 border-t border-deck-line">
            <a href="#/vault" className="text-xs text-deck-accent hover:underline">
              {t("agents.vaultLink")}
            </a>
          </div>
        </div>
      </section>

      {dialog && (
        <ProviderDialog
          draft={dialog}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
        />
      )}


      <AdoptPanel onAdopted={load} />
    </div>
  );
}
