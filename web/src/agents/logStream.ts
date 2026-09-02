/*
logStream — resilient WebSocket log stream for LogTerminal.

Policy (R21): a backend daemon restart is a ROUTINE operation (takeover), so
the stream must heal itself. Reconnect with capped exponential backoff
(500ms doubling to 5s), reset the ladder on a successful open, and never
retry code 4404 — an unknown agent is a fact to report, not a failure to
retry. close() is absolute: mid-backoff cancellation must leave no timers.
*/

export type LogStreamStatus = "connecting" | "open" | "reconnecting" | "closed" | "unknown-agent";

export interface LogStreamOptions {
  onLine?: (line: string) => void;
  onStatus?: (status: LogStreamStatus) => void;
  /** ms ladder; defaults to 500 → 5s cap */
  backoffBaseMs?: number;
  backoffCapMs?: number;
}

export interface LogStream {
  close: () => void;
}

export function createLogStream(
  agentId: string,
  opts: LogStreamOptions = {},
): LogStream {
  const base = opts.backoffBaseMs ?? 500;
  const cap = opts.backoffCapMs ?? 5_000;
  let ws: WebSocket | null = null;
  let disposed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cleanupSocket() {
    if (ws) {
      // detach handlers so late events cannot re-trigger the ladder
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      ws = null;
    }
  }

  function connect() {
    if (disposed) return;
    opts.onStatus?.(attempt === 0 ? "connecting" : "reconnecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/api/agents/${agentId}/logs`);
    ws.onopen = () => {
      attempt = 0; // fresh socket: reset the backoff ladder
      opts.onStatus?.("open");
    };
    ws.onmessage = (ev: MessageEvent) => {
      opts.onLine?.(
        typeof ev.data === "string"
          ? ev.data
          : JSON.stringify((ev as MessageEvent).data),
      );
    };
    ws.onclose = (ev: CloseEvent) => {
      if (disposed) return;
      cleanupSocket();
      if (ev.code === 4404) {
        // the agent does not exist — retrying would be noise about a fact
        opts.onStatus?.("unknown-agent");
        return;
      }
      const delay = Math.min(cap, base * 2 ** attempt);
      attempt += 1;
      timer = setTimeout(connect, delay);
    };
  }

  connect();

  return {
    close() {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      cleanupSocket();
      opts.onStatus?.("closed");
    },
  };
}
