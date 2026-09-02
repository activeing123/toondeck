import { useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
import { createLogStream } from "./logStream";

const STATUS_LINE: Record<string, string> = {
  connecting: "⏺ streaming logs",
  open: "⏺ streaming logs",
  reconnecting: "⟳ connection dropped — reconnecting…",
  "unknown-agent": "⏹ agent unknown (not launched yet?) — not retrying",
  closed: "⏹ stream closed",
};

/** Read-only xterm wired to an agent's log WebSocket (self-healing stream). */
export default function LogTerminal({ agentId }: { agentId: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    let stream: { close: () => void } | null = null;

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
        onLine: (line) => term?.writeln(line),
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

  return <div ref={hostRef} className="h-64 w-full" />;
}
