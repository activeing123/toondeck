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

type SkillRow = SkillsState["skills"][number];

function CategoryGroup({
  cat,
  list,
  busy,
  onRemove,
}: {
  cat: string;
  list: SkillRow[];
  busy: boolean;
  onRemove: (name: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-deck px-2 py-1.5 text-left text-sm hover:bg-deck-panel2"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        <b>{cat}</b>
        <span className="text-deck-muted text-xs">{list.length}</span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((s) => (
            <div key={s.dirname} className="glass rounded-deck p-4">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    s.valid ? "bg-led-ok" : "bg-led-err"
                  }`}
                />
                <h3 className="font-semibold">{s.name ?? s.dirname}</h3>
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

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

  // human-readable auto-categories (name-prefix first, then description keywords)
  const CATEGORY_RULES: [RegExp, string][] = [
    [/video|comfy|remotion|hyperframes|seedance|剪映|视频|tts|asr|语音|播客|口播|字幕|song|music/i, "🎬 视频与音频"],
    [/search|搜索|exa|wigolo|crawl|抓取|爬虫|reddit|twitter|热榜|trend|last30|research|omni|kb/i, "🔍 搜索与情报"],
    [/download|下载|网盘|xiazai|kuake|quark|aria2|baidu|xunlei|netdisk/i, "📥 下载"],
    [/gbrain|记忆|memory|zhangben|jiyi|mempalace|账本|handoff|huihua|会话|session|index/i, "🧠 记忆与会话"],
    [/git|github|gh-|code|dev|python|powershell|testing|security|docker|tauri|insforge|skill|规范|review|tdd|archify|tupu|config|debug|error/i, "🛠 开发工程"],
    [/clash|vps|ssh|网络|代理|lunxun|streamguard|surfshark|隧道|dual-machine|cf|cdn|yuming|域名/i, "🌐 网络与基础设施"],
    [/推广|tuiguang|blog|博主|发帖|shejiao|mail|邮箱|mailbot|x-ai|blogger|内容|ribao|xiewen|写文|humanizer|写作/i, "📣 内容与增长"],
    [/mcp|toondeck|api|key|llm|模型|model|apikey|rotate|dsh|agent|窗口|term|定时|automat|windows|scan|zclean|qingli|password|kami|-pdf|doc/i, "🔌 平台与工具"],
    [/设计|design|图|svg|海报|card|figma|图像|vision|ocr|截图|logo|icon|gpt-image/i, "🎨 设计与图像"],
  ];
  const categoryOf = (name: string, desc?: string | null): string => {
    const hay = `${name} ${desc ?? ""}`;
    for (const [rx, label] of CATEGORY_RULES) if (rx.test(hay)) return label;
    return "📦 其他";
  };
  const groups = new Map<string, typeof shown>();
  for (const s of shown) {
    const c = categoryOf(s.dirname, s.description);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(s);
  }

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

      {[...groups.entries()].map(([cat, list]) => (
        <CategoryGroup key={cat} cat={cat} list={list} busy={busy} onRemove={onRemove} />
      ))}
      {shown.length === 0 && (
        <p className="text-deck-muted text-sm">no skills match "{query}"</p>
      )}
    </div>
  );
}
