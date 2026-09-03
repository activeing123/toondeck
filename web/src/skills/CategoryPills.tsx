import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ZeroState } from "../ui/ZeroState";
import { toast } from "../ui/Toast";
import { removeSkill, syncSkill } from "./api";
import { CATEGORY_RULES, categoryOf, OTHER, type SkillLike as SkillRow } from "./categories";

/** 分类 pill 导航：一排看全分类数，点击过滤，搜索框置顶。 */
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
      {skills.length === 0 ? (
        // R33: zero skills is a different story from "no search hits"
        <ZeroState icon="🧩" titleKey="skills.emptyTitle" hintKey="skills.emptyHint" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => (
              <SkillCard key={s.dirname} s={s} onChanged={onChanged} />
            ))}
          </div>
          {shown.length === 0 && (
            <p className="text-sm text-deck-muted">{t("skills.noMatch")}</p>
          )}
        </>
      )}
    </div>
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
        <button
          data-testid={`skill-sync-${s.dirname}`}
          onClick={onSync}
          disabled={busy}
          className="rounded-deck border border-deck-line px-2 py-1 hover:bg-deck-panel2 disabled:opacity-50"
        >
          {busy ? t("skills.cardSyncing") : t("skills.cardSync")}
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
