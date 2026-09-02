import { useEffect, useState } from "react";

export type ServerView = {
  name: string;
  transport: string;
  target: string;
  env_keys: string[];
  header_keys: string[];
  disabled_tools: string[];
};

export type McpState = {
  servers: ServerView[];
  server_total: number;
  disabled_total: number;
  config_path: string;
};

export type SyncResult = { agent: string; ok: boolean; error?: string };

export function fetchState(): Promise<McpState> {
  return fetch("/api/mcp/state").then((r) => r.json());
}

export function toggleTool(server: string, tool: string): Promise<void> {
  return fetch("/api/mcp/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server, tool }),
  }).then(() => undefined);
}

export function requestSync(): Promise<SyncResult[]> {
  return fetch("/api/mcp/sync", { method: "POST" })
    .then((r) => r.json())
    .then((b) => b.results);
}

export function useMcpState() {
  const [state, setState] = useState<McpState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setBusy(true);
    fetchState()
      .then(setState)
      .catch(() => setError("engine unreachable"))
      .finally(() => setBusy(false));
  };

  useEffect(reload, []);
  return { state, error, busy, reload, setState };
}
