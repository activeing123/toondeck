import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ZeroState } from "../ui/ZeroState";
import { toast } from "../ui/Toast";
import { removeSkill, syncSkill } from "./api";
import { CATEGORY_RULES, categoryOf, OTHER, type SkillLike as SkillRow } from "./categories";

/*
 * R50 (P1-1) — the Skills page was a keyboard marathon: 918 buttons /
 * 929 tab stops because every skill rendered its card up front. New IA:
 * - default COLLAPSED: pills only (≈15 tab stops), zero cards
 * - click a pill to expand that category (click again to collapse)
 * - typing a query switches to flat search results across all categories
 * R50 (P1-3) — the pills used to render the raw match pattern first
 * ("video|comfy|remotion|hyp… 🎬 视频与音频"): Object.entries destructure
 * named the pattern "emoji". Patterns now live in the pill tooltip only.
 *
 * N-lane — even collapsed IA breaks down when ONE category is huge (the real
 * farm has a 158-skill category) or the query is broad: the grid rendered
 * every card, 19311px of page / 929 tab stops again. The grid now opens in
 * progressive windows (24 cards + one "show more" button per step), and the
 * window resets whenever the expanded category or the query changes.
 */
const PAGE_SIZE = 24;

export default function CategoryPills({
  skills,
  query,
  onQuery,
  onChanged,
}: {
  skills: SkillRow[];
  query: string;
  onQuery: (q: string) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [window_, setWindow_] = useState(PAGE_SIZE);
  const searching = query.trim().length > 0;

  // fresh category / fresh query → fresh window (no stale "show more" tail)
  useEffect(() => {
    setWindow_(PAGE_SIZE);
  }, [expanded, query]);

  const catList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skills) {
      const c = categoryOf(s);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Object.entries(CATEGORY_RULES)
      .map(([label, pattern]) => ({ label, pattern, n: counts.get(label) ?? 0 }))
      .concat(counts.has(OTHER) ? [{ label: OTHER, pattern: "", n: counts.get(OTHER)! }] : [])
      .filter((c) => c.n > 0);
  }, [skills]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (!searching && expanded && categoryOf(s) !== expanded) return false;
      if (!q) return true;
      return (
        (s.name ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        s.dirname.toLowerCase().includes(q)
      );
    });
  }, [skills, expanded, query, searching]);

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t("skills.searchPlaceholder")}
        className="w-full rounded-deck border border-deck-line bg-deck-panel px-4 py-2.5 text-sm outline-none focus:border-deck-accent"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("skills.groupsLabel")}>
        {catList.map((c) => (
          <button
            key={c.label}
            data-testid={`category-pill-${c.label}`}
            aria-pressed={expanded === c.label}
            title={c.pattern ? `${t("skills.matchesHint")}: ${c.pattern}` : undefined}
            onClick={() => setExpanded(expanded === c.label ? null : c.label)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              expanded === c.label
                ? "border-deck-accent bg-deck-accent/15 text-deck-accent"
                : "border-deck-line text-deck-muted hover:border-deck-accent/50"
            }`}
          >
            {c.label} {c.n}
          </button>
        ))}
      </div>
      {skills.length === 0 ? (
        // R33: zero skills is a different story from "no search hits"
        <ZeroState
          icon="🧩"
          titleKey="skills.emptyTitle"
          hintKey="skills.emptyHint"
          ctaHref="#/agents"
          ctaLabelKey="common.ctaGoAgents"
        />
      ) : searching ? (
        <>
          <p className="text-xs text-deck-muted" data-testid="search-hits">
            {t("skills.searchHits", { n: shown.length })}
          </p>
          <WindowedGrid
            shown={shown}
            window_={window_}
            onGrow={() => setWindow_((v) => v + PAGE_SIZE)}
            onChanged={onChanged}
          />
          {shown.length === 0 && (
            <p className="text-sm text-deck-muted">{t("skills.noMatch")}</p>
          )}
        </>
      ) : expanded ? (
        <WindowedGrid
          shown={shown}
          window_={window_}
          onGrow={() => setWindow_((v) => v + PAGE_SIZE)}
          onChanged={onChanged}
        />
      ) : (
        <p className="text-sm text-deck-muted" data-testid="pick-category">
          {t("skills.pickCategory")}
        </p>
      )}
    </div>
  );
}

function WindowedGrid({
  shown,
  window_,
  onGrow,
  onChanged,
}: {
  shown: SkillRow[];
  window_: number;
  onGrow: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const visible = shown.slice(0, window_);
  const rest = shown.length - visible.length;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => (
          <SkillCard key={s.dirname} s={s} onChanged={onChanged} />
        ))}
      </div>
      {rest > 0 && (
        <button
          data-testid="show-more-skills"
          onClick={onGrow}
          className="rounded-deck border border-deck-line px-4 py-2 text-sm text-deck-muted hover:border-deck-accent/50 hover:text-deck-accent"
        >
          {t("skills.showMore", { n: rest })}
        </button>
      )}
    </>
  );
}

function SkillCard({ s, onChanged }: { s: SkillRow; onChanged: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const displayName = s.name ?? s.dirname;

  const onSync = () => {
    setBusy(true);
    syncSkill(s.dirname)
      .then((r) => {
        if (r.ok) toast.ok(t("skills.syncOneDone", { name: displayName }));
        else toast.error(t("skills.syncOneFail", { name: displayName }));
        onChanged();
      })
      .finally(() => setBusy(false));
  };

  const onRemove = () => {
    setBusy(true);
    removeSkill(s.dirname)
      .then((r) => {
        if (r.ok) toast.ok(t("skills.removeDone", { name: displayName }));
        else toast.error(t("skills.removeFail", { name: displayName }));
        onChanged();
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="glass rounded-deck p-3">
      <div className="flex items-center gap-2">
        <span className="truncate font-mono text-sm font-semibold">{displayName}</span>
        {!s.valid && (
          <span className="ml-auto text-xs text-led-err">{t("skills.invalidBadge")}</span>
        )}
      </div>
      {s.description && (
        <p className="mt-1 line-clamp-2 text-xs text-deck-muted">{s.description}</p>
      )}
      <div className="mt-2 flex gap-2 text-xs">
        {/* 小白-7: card sync is the same overwrite family — graded warning */}
        <button
          data-testid={`skill-sync-${s.dirname}`}
          onClick={onSync}
          disabled={busy}
          className="rounded-deck border border-led-warn/50 px-2 py-1 text-led-warn hover:bg-led-warn/10 disabled:opacity-50"
        >
          {busy ? t("skills.cardSyncing") : `⚠ ${t("skills.cardSync")}`}
        </button>
        <button
          data-testid={`skill-details-${s.dirname}`}
          onClick={() => setOpen((v) => !v)}
          className="rounded-deck border border-deck-line px-2 py-1 hover:bg-deck-panel2"
        >
          {t("skills.cardDetails")}
        </button>
        <button
          data-testid={`skill-remove-${s.dirname}`}
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="ml-auto rounded-deck border border-led-err/40 px-2 py-1 text-led-err hover:bg-led-err/10 disabled:opacity-50"
        >
          {t("skills.cardRemove")}
        </button>
      </div>
      {open && (
        <div className="mt-2 border-t border-deck-line pt-2 text-xs text-deck-muted">
          <div>
            <span className="font-semibold">{t("skills.cardFolder")}:</span>{" "}
            <code>{s.dirname}</code>
          </div>
          {s.errors && s.errors.length > 0 && (
            <div className="mt-1">
              <span className="font-semibold text-led-err">{t("skills.cardErrors")}</span>{" "}
              {s.errors.join("; ")}
            </div>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          messageKey="skills.removeWarn"
          messageVars={{ name: displayName }}
          confirmLabel={t("skills.removeConfirm")}
          onConfirm={() => {
            setConfirming(false);
            onRemove();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
