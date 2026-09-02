import { useEffect, useState } from "react";
import {
  fetchDoctor,
  fetchSkillsState,
  removeSkill,
  requestSkillsSync,
  watcherGet,
  watcherPost,
  type DoctorReport,
  type SkillsState,
  type WatcherStatus,
} from "./api";

function ViewMatrix({ views }: { views: DoctorReport["views"] }) {
  return (
    <div className="glass rounded-deck p-4">
      <div className="text-xs text-deck-muted uppercase tracking-wide mb-2">agent views</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {views.map((v) => (
          <div key={v.agent} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                v.ok ? "bg-led-ok shadow-glow-ok" : "bg-led-warn"
              }`}
            />
            <span>{v.agent}</span>
            {v.issues.length > 0 && (
              <span className="ml-auto text-xs text-led-warn" title={v.issues.join("\n")}>
                {v.issues.length}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SkillsPanel() {
  const [state, setState] = useState<SkillsState | null>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [watcher, setWatcher] = useState<WatcherStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [lastSync, setLastSync] = useState<string[] | null>(null);

  const load = () => {
    Promise.all([fetchSkillsState(), fetchDoctor(), watcherGet()]).then(
      ([s, d, w]) => {
        setState(s);
        setDoctor(d);
        setWatcher(w);
      },
    );
  };
  useEffect(load, []);

  const onSync = () => {
    setBusy(true);
    requestSkillsSync()
      .then((results) => setLastSync(results.flatMap((r) => r.actions).slice(0, 20)))
      .then(load)
      .finally(() => setBusy(false));
  };

  const onDoctor = () => {
    setBusy(true);
    fetchDoctor().then(setDoctor).finally(() => setBusy(false));
  };

  const onWatcher = () => {
    setBusy(true);
    const action = watcher?.running ? "stop" : "start";
    watcherPost(action).then(load).finally(() => setBusy(false));
  };

  const onRemove = (name: string) => {
    if (!window.confirm(`Remove skill "${name}"? It goes to the graveyard (reversible).`)) return;
    setBusy(true);
    removeSkill(name)
      .then(load)
      .finally(() => setBusy(false));
  };

  if (!state) return <p className="text-deck-muted">loading deck…</p>;
  const q = query.trim().toLowerCase();
  const shown = state.skills.filter(
    (s) => !q || s.dirname.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">
          Skills <span className="text-deck-accent">{state.counts.total}</span>
          <span className="text-sm text-deck-muted ml-3">
            {state.counts.valid} valid · source: {state.source}
          </span>
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={load}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:bg-deck-panel2"
          >
            refresh
          </button>
          <button
            onClick={onSync}
            disabled={busy}
            className="rounded-deck bg-deck-accent px-3 py-1.5 text-sm font-semibold text-deck-bg hover:opacity-90"
          >
            {busy ? "…" : "sync all agents"}
          </button>
          <button
            onClick={onDoctor}
            disabled={busy}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:bg-deck-panel2"
          >
            doctor
          </button>
          <button
            onClick={onWatcher}
            disabled={busy}
            className={`rounded-deck border px-3 py-1.5 text-sm ${
              watcher?.running
                ? "border-led-ok text-led-ok"
                : "border-deck-line hover:bg-deck-panel2"
            }`}
          >
            {watcher?.running ? "● watching" : "○ watch off"}
          </button>
        </div>
      </div>

      <input
        placeholder="filter skills…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="glass rounded-deck px-3 py-2 text-sm w-full md:w-72"
      />

      {doctor && (
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              doctor.summary === "ok" ? "bg-led-ok shadow-glow-ok" : "bg-led-warn"
            }`}
          />
          <span>
            doctor: <b>{doctor.summary}</b> · graveyard {doctor.graveyard.removed} removed
          </span>
        </div>
      )}

      {doctor && <ViewMatrix views={doctor.views} />}

      {lastSync && lastSync.length > 0 && (
        <div className="glass rounded-deck p-3 text-xs font-mono text-deck-muted">
          {lastSync.map((a, i) => (
            <div key={i}>{a}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {shown.map((s) => (
          <section key={s.dirname} className="glass rounded-deck p-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  s.valid ? "bg-led-ok" : "bg-led-err"
                }`}
              />
              <h2 className="font-semibold">{s.name ?? s.dirname}</h2>
              {!s.valid && (
                <span className="ml-auto text-xs text-led-err" title={s.errors.join("\n")}>
                  invalid
                </span>
              )}
              {s.valid && (
                <button
                  onClick={() => onRemove(s.dirname)}
                  disabled={busy}
                  className="ml-auto text-xs text-deck-muted hover:text-led-err"
                >
                  remove
                </button>
              )}
            </div>
            {s.description && (
              <p className="mt-1.5 text-sm text-deck-muted line-clamp-2">{s.description}</p>
            )}
            {!s.valid && s.errors.length > 0 && (
              <p className="mt-1.5 text-xs text-led-err">{s.errors[0]}</p>
            )}
          </section>
        ))}
        {shown.length === 0 && (
          <p className="text-deck-muted text-sm">no skills match "{query}"</p>
        )}
      </div>
    </div>
  );
}
