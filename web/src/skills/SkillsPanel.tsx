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
import HowTo from "../ui/HowTo";
import { useI18n } from "../i18n";

export default function SkillsPanel() {
  const { t } = useI18n();
  const [state, setState] = useState<SkillsState | null>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [watcher, setWatcher] = useState<WatcherStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [lastSync, setLastSync] = useState<string[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const load = () => {
    setUnreachable(false);
    Promise.all([fetchSkillsState(), fetchDoctor(), watcherGet()]).then(
      ([s, d, w]) => {
        setState(s);
        setDoctor(d);
        setWatcher(w);
      },
    ).catch(() => {
      // N-R9: the MCP/Agents pages report an unreachable engine — the skills
      // page used to spin on "loading deck…" forever, which reads as "slow"
      // instead of "down". Say it, honestly.
      setUnreachable(true);
    });
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

  if (unreachable)
    return (
      <div
        data-testid="skills-unreachable"
        className="glass rounded-deck p-4 text-sm space-y-1"
      >
        <p className="font-semibold text-led-err">{t("skills.unreachableTitle")}</p>
        <p className="text-deck-muted">{t("skills.unreachableHint")}</p>
        <button
          onClick={load}
          className="rounded-deck border border-deck-line px-3 py-1 text-xs hover:bg-deck-panel2"
        >
          {t("common.refresh")}
        </button>
      </div>
    );
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
            {t("common.refresh")}
          </button>
          {/* 小白-7: sync overwrites agent shelves — visually graded as the
              dangerous family (⚠ + warning color), distinct from refresh/体检 */}
          <button
            onClick={onSync}
            disabled={busy}
            title={t("skills.syncWarnTitle")}
            data-testid="sync-all-danger"
            className="rounded-deck border border-led-err/50 bg-led-err/10 px-3 py-1.5 text-sm font-semibold text-led-err hover:bg-led-err/20 disabled:opacity-40"
          >
            {busy ? "…" : `⚠ ${t("skills.syncAll")}`}
          </button>
          <button
            onClick={onDoctor}
            disabled={busy}
            className="rounded-deck border border-deck-line px-3 py-1.5 text-sm hover:bg-deck-panel2"
          >
            {t("skills.doctorBtn")}
          </button>
          <button
            onClick={onWatcher}
            disabled={busy}
            title={t("skills.watchHint")}
            className={`rounded-deck border px-3 py-1.5 text-sm ${
              watcher?.running
                ? "border-led-ok text-led-ok"
                : "border-deck-line hover:bg-deck-panel2"
            }`}
          >
            {watcher?.running ? t("skills.watchOn") : t("skills.watchOff")}
          </button>
        </div>
      </div>

      {/* N-R14 / U1-③: this page had TWO search boxes bound to the same
          `query` — this one (hardcoded English placeholder) and the one inside
          CategoryPills right below it. Two identical-looking-but-different
          inputs on one panel read as two different filters. CategoryPills'
          box stays: its placeholder is localized and actually tells you what
          it searches ("skill names or descriptions"), and it sits next to the
          categories it filters. `query` itself stays — it is still the single
          source of truth handed down to CategoryPills. */}

      {/* R54: tutorial — category pills, search flattens, sync/remove semantics */}
      <HowTo
        page="skills"
        steps={[t("howto.skills.1"), t("howto.skills.2"), t("howto.skills.3")]}
      />

      {doctor && (
        <div className="flex items-center gap-3 text-sm">
          <Led
            tone={doctor.summary === "ok" ? "ok" : "warn"}
            label={t("skills.doctorLed", { summary: doctor.summary })}
          />
          <span>{t("skills.doctorLine", { summary: doctor.summary, n: doctor.graveyard.removed })}</span>
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
