import type { DoctorReport } from "./api";
import { useI18n } from "../i18n";
import { Led } from "../ui/Led";

export default function ViewMatrix({ views }: { views: DoctorReport["views"] }) {
  const { t } = useI18n();
  return (
    <div className="glass rounded-deck p-4">
      <div className="text-xs text-deck-muted uppercase tracking-wide">{t("skills.viewsTitle")}</div>
      {/* 小白-6: say what a green lamp means, in one line */}
      <p className="mt-1 mb-2 text-xs text-deck-muted" data-testid="views-subtitle">
        {t("skills.viewsSubtitle")}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {views.map((v) => (
          <div key={v.agent} className="flex items-center gap-2 text-sm">
            <Led tone={v.ok ? "ok" : "warn"} label={`${v.agent}: ${t(v.ok ? "led.ok" : "led.warn")}`} />
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
