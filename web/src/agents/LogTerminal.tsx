import { useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";

/** Read-only xterm wired to an agent's log WebSocket. No input ever sent. */
export default function LogTerminal({ agentId }: { agentId: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let term: Terminal | null = null;

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
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/agents/${agentId}/logs`);
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          term?.writeln(typeof data === "string" ? data : JSON.stringify(data));
        } catch {
          term?.writeln(String(ev.data));
        }
      };
      ws.onclose = () => term?.writeln("⏹ stream closed");
    })();

    return () => {
      disposed = true;
      ws?.close();
      term?.dispose();
    };
  }, [agentId]);

  return <div ref={hostRef} className="h-64 w-full" />;
}
