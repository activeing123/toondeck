/*
HealthVerdict — the trust card after a fleet probe (R28).

The backend already returns per-server latency, a checked count, and the
timeout cap the sweep used; the old card hid all of that behind "N ok".
Surfacing the wall time + cap answers the user's silent question ("is my
fleet slow, or is the probe just thorough?") without a re-run. Per-server
latency is graded against the cap: green at <25% of it, amber at ≥25%,
error/timeout verdicts keep their own colors.
*/

import { useI18n } from "../i18n";
import { Led } from "../ui/Led";
import type { HealthResult } from "./api";

function gradeLatency(ms: number, status: string, capS: number): string {
  if (status === "error") return "text-led-err";
  if (status === "timeout") return "text-led-warn";
  const frac = ms / 1000 / Math.max(capS, 1);
  return frac >= 0.25 ? "text-led-warn" : "text-led-ok";
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function HealthVerdict({
  results,
  wallMs,
  timeoutS,
  onRerun,
}: {
  results: HealthResult[];
  wallMs: number;
  timeoutS: number | null;
  onRerun: () => void;
}) {
  const { t } = useI18n();
  const ok = results.filter((h) => h.status === "ok").length;
  const timeout = results.filter((h) => h.status === "timeout").length;
  const error = results.filter((h) => h.status === "error").length;

  return (
    <div className="glass rounded-deck p-3 text-sm" data-testid="health-verdict">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <span className="font-semibold">
          {ok}/{results.length} ok
        </span>
        {timeout > 0 && <span className="text-led-warn">· {timeout} timeout</span>}
        {error > 0 && <span className="text-led-err">· {error} error</span>}
        <span className="text-deck-muted">
          · {t("mcp.healthWall", { s: (wallMs / 1000).toFixed(1) })}
        </span>
        {timeoutS != null && (
          <span className="text-deck-muted">· {t("mcp.healthCap", { n: timeoutS })}</span>
        )}
        <button
          onClick={onRerun}
          className="ml-auto rounded-deck border border-deck-line px-2 py-0.5 text-xs hover:bg-deck-panel2"
        >
          {t("mcp.healthRerun")}
        </button>
      </div>
      {results.map((h) => (
        <div key={h.server} className="flex items-center gap-2">
          <Led
            tone={h.status === "ok" ? "ok" : h.status === "timeout" ? "warn" : "err"}
            label={`${h.server}: ${t(h.status === "ok" ? "led.ok" : h.status === "timeout" ? "led.timeout" : "led.err")}`}
          />
          <span className="font-medium">{h.server}</span>
          <span className="text-deck-muted">{h.status}</span>
          <span className={`ml-auto font-mono text-xs ${gradeLatency(h.latency_ms, h.status, timeoutS ?? 10)}`}>
            {h.tools} tools · {fmtMs(h.latency_ms)}
          </span>
          {h.error && <span className="text-led-err text-xs">{h.error}</span>}
        </div>
      ))}
    </div>
  );
}
