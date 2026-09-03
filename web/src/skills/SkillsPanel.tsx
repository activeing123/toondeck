import { useEffect, useState } from "react";
import {
  fetchDoctor,
  fetchSkillsState,
  requestSkillsSync,
  watcherGet,
  watcherPost,
  type DoctorReport,
  type SkillsState,
  type WatcherStatus,
} from "./api";
import CategoryPills from "./CategoryPills";
import ViewMatrix from "./ViewMatrix";
import { Led } from "../ui/Led";

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

  if (!state) return <p className="text-deck-muted">loading deck…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">
          Skills <span className="text-deck-accent">{state.counts.total}</span>
          <span className="text-sm text-deck-muted ml-3">
            {state.counts.valid} valid · source: {state.source_display ?? state.source}
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
          <Led tone={doctor.summary === "ok" ? "ok" : "warn"} label={`doctor: ${doctor.summary}`} />
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

      <CategoryPills
        skills={state.skills}
        query={query}
        onQuery={setQuery}
        onChanged={load}
      />
    </div>
  );
}
