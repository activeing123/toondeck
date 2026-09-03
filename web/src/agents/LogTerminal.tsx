import { useEffect, useMemo, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { createLogStream } from "./logStream";
import { filterLogLines } from "./logFilter";
import { useI18n } from "../i18n";

const STATUS_LINE: Record<string, string> = {
  connecting: "⏺ streaming logs",
  open: "⏺ streaming logs",
  reconnecting: "⟳ connection dropped — reconnecting…",
  "unknown-agent": "⏹ agent unknown (not launched yet?) — not retrying",
  closed: "⏹ stream closed",
};

const FILTER_CAP = 500;

/**
 * Read-only xterm wired to an agent's log WebSocket (self-healing stream).
 *
 * R32: with `filterable`, buffered lines are also kept in memory and a query
 * box swaps the live view for a case-insensitive filtered view with an honest
 * match count — watching and finding are different jobs. The stream keeps
 * running beneath the filter; clearing the query returns to the live view.
 */
export default function LogTerminal({ agentId, filterable = false }: { agentId: string; filterable?: boolean }) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef<string[]>([]);
  const [query, setQuery] = useState("");
  const [bufferTick, setBufferTick] = useState(0);

  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    let stream: { close: () => void } | null = null;
    bufferRef.current = [];

    (async () => {
      const [{ Terminal: XTerm }, css] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/xterm/css/xterm.css"),
      ]);
      if (disposed || !hostRef.current) return;
      void css;
      term = new XTerm({
        disableStdin: true,
        convertEol: true,
        fontSize: 12,
        theme: { background: "#00000000", foreground: "#d8d4c8" },
      });
      term.open(hostRef.current);
      term.writeln(`⏺ streaming logs: ${agentId}`);
      stream = createLogStream(agentId, {
        onLine: (line) => {
          term?.writeln(line);
          bufferRef.current.push(line);
          setBufferTick((x) => x + 1);
        },
        onStatus: (status) => {
          if (status !== "open" && status !== "connecting") {
            term?.writeln(STATUS_LINE[status] ?? status);
          }
        },
      });
    })();

    return () => {
      disposed = true;
      stream?.close();
      term?.dispose();
    };
  }, [agentId]);

  const filtered = useMemo(
    () => filterLogLines(bufferRef.current, query, FILTER_CAP),
    // bufferTick: lines arrive asynchronously; the memo re-runs on each append
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, bufferTick],
  );

  return (
    <div>
      {filterable && (
        <div className="mb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("logs.filterPlaceholder")}
            className="w-full rounded-deck bg-deck-panel2 px-3 py-1.5 text-sm"
          />
          {query.trim() !== "" && (
            <p className="mt-1 text-xs text-deck-muted">
              {filtered.total === 0
                ? t("logs.noMatch")
                : filtered.capped
                  ? t("logs.filterCapped", { shown: filtered.matches.length, total: filtered.total })
                  : t("logs.filterCount", { n: filtered.total })}
            </p>
          )}
        </div>
      )}
      {query.trim() !== "" ? (
        <div
          data-testid="log-filter-view"
          className="h-64 w-full overflow-auto rounded-deck bg-black/40 p-2 font-mono text-xs leading-5"
        >
          {filtered.matches.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div ref={hostRef} className="h-64 w-full" />
      )}
    </div>
  );
}
