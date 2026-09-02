import type { ReactNode } from "react";
import { useI18n } from "../i18n";

type StateProps = {
  loading: boolean;
  unreachable?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  children: ReactNode;
};

/**
 * UX-C2: the anti-evaporation primitive. Data sections must render one of
 * three honest states — loading, unreachable (with retry), or empty — and
 * never silently return null when a fetch fails. `empty` only applies when
 * a payload arrived but has no rows; unreachable means the fetch itself died.
 */
export default function State({
  loading,
  unreachable = false,
  empty = false,
  emptyLabel,
  onRetry,
  children,
}: StateProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-sm text-deck-muted">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-deck-accent" />
        {t("common.loading")}
      </div>
    );
  }

  if (unreachable) {
    return (
      <div className="glass rounded-deck px-3 py-3 text-sm">
        <span className="text-led-err">{t("state.unreachable")}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-3 rounded-deck border border-deck-line px-2.5 py-1 text-xs hover:bg-deck-panel2"
          >
            {t("state.retry")}
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return <p className="px-1 py-3 text-sm text-deck-muted">{emptyLabel ?? "—"}</p>;
  }

  return <>{children}</>;
}
