import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { CATEGORY_RULES, categoryOf, OTHER, type SkillLike as SkillRow } from "./categories";

/** 分类 pill 导航：一排看全分类数，点击过滤，搜索框置顶。 */
export default function CategoryPills({
  skills,
  query,
  onQuery,
}: {
  skills: SkillRow[];
  query: string;
  onQuery: (q: string) => void;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<string>("__all__");

  const catList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skills) {
      const c = categoryOf(s);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Object.entries(CATEGORY_RULES)
      .map(([label, emoji]) => ({ label, emoji, n: counts.get(label) ?? 0 }))
      .concat(counts.has(OTHER) ? [{ label: OTHER, emoji: "", n: counts.get(OTHER)! }] : [])
      .filter((c) => c.n > 0);
  }, [skills]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (active !== "__all__" && categoryOf(s) !== active) return false;
      if (!q) return true;
      return (
        (s.name ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        s.dirname.toLowerCase().includes(q)
      );
    });
  }, [skills, active, query]);

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t("skills.searchPlaceholder")}
        className="w-full rounded-deck border border-deck-line bg-deck-panel px-4 py-2.5 text-sm outline-none focus:border-deck-accent"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActive("__all__")}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            active === "__all__"
              ? "border-deck-accent bg-deck-accent/15 text-deck-accent"
              : "border-deck-line text-deck-muted hover:border-deck-accent/50"
          }`}
        >
          {t("skills.all", { n: skills.length })}
        </button>
        {catList.map((c) => (
          <button
            key={c.label}
            onClick={() => setActive(c.label)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              active === c.label
                ? "border-deck-accent bg-deck-accent/15 text-deck-accent"
                : "border-deck-line text-deck-muted hover:border-deck-accent/50"
            }`}
          >
            {c.emoji} {c.label} {c.n}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((s) => (
          <SkillCard key={s.dirname} s={s} />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="text-sm text-deck-muted">{t("skills.noMatch")}</p>
      )}
    </div>
  );
}

function SkillCard({ s }: { s: SkillRow }) {
  return (
    <div className="glass rounded-deck p-3">
      <div className="flex items-center gap-2">
        <span className="truncate font-mono text-sm font-semibold">{s.name ?? s.dirname}</span>
        {!s.valid && <span className="ml-auto text-xs text-led-err">invalid</span>}
      </div>
      {s.description && (
        <p className="mt-1 line-clamp-2 text-xs text-deck-muted">{s.description}</p>
      )}
    </div>
  );
}
