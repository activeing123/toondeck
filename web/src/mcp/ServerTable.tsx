/*
 * ServerTable (R47) — THE one server list on the MCP page.
 *
 * Replaces the four-card chaos (ToolsBrowser lazy inventory + DiscoverPanel
 * candidates + managed-server grid + separate health rows): every server the
 * deck can see gets exactly ONE row, whether it is under management or just
 * present in some agent's config. Health results fold into the same rows —
 * the separate per-server health list is gone.
 *
 * Row anatomy: status LED · mono name · managed/discovered badge · transport ·
 * tools · latency · target · source chips · key chips · error line (always
 * visible, never buried). Expanded: tool pills; managed rows also expose
 * disabled-tool re-enable toggles; discovered rows expose one-click adopt.
 */

import { useState } from "react";
import { useI18n } from "../i18n";
import { Led } from "../ui/Led";
import type { HealthResult, InventoryServer, ServerView } from "./api";

export type ServerRow = {
  name: string;
  managed: boolean;
  transport: string;
  target: string;
  sources: string[];
  env_keys: string[];
  header_keys: string[];
  disabled_tools: string[];
  toolCount: number;
  tools: { name: string; description: string }[];
  status: string; // "ok" | "timeout" | "error" | "unknown"
  latencyMs: number | null;
  error: string | null;
};

export function buildRows(managed: ServerView[], inventory: InventoryServer[] | undefined, health: HealthResult[] | null): ServerRow[] {
  const invBy = new Map((inventory ?? []).map((s) => [s.server, s]));
  const healthBy = new Map((health ?? []).map((h) => [h.server, h]));
  const rows: ServerRow[] = [];
  for (const s of managed) {
    const iv = invBy.get(s.name);
    const h = healthBy.get(s.name);
    rows.push({
      name: s.name,
      managed: true,
      transport: s.transport,
      target: s.target,
      sources: s.sources ?? [],
      env_keys: s.env_keys,
      header_keys: s.header_keys,
      disabled_tools: s.disabled_tools,
      toolCount: iv ? iv.tools.length : s.tool_total,
      tools: iv?.tools ?? [],
      status: h ? h.status : (iv?.status ?? "unknown"),
      latencyMs: h ? h.latency_ms : (iv?.latency_ms ?? null),
      error: h?.error ?? iv?.error ?? null,
    });
  }
  for (const iv of inventory ?? []) {
    if (invBy.size === 0 || managed.some((s) => s.name === iv.server)) continue;
    const h = healthBy.get(iv.server);
    rows.push({
      name: iv.server,
      managed: false,
      transport: "",
      target: "",
      sources: [],
      env_keys: [],
      header_keys: [],
      disabled_tools: [],
      toolCount: iv.tools.length,
      tools: iv.tools,
      status: h ? h.status : iv.status,
      latencyMs: h ? h.latency_ms : iv.latency_ms,
      error: h?.error ?? iv.error,
    });
  }
  return rows;
}

function statusTone(status: string): "ok" | "warn" | "err" | "off" {
  if (status === "ok") return "ok";
  if (status === "timeout") return "warn";
  if (status === "error") return "err";
  return "off";
}

function statusWord(status: string): string {
  if (status === "ok") return "led.ok";
  if (status === "timeout") return "led.timeout";
  if (status === "error") return "led.err";
  return "led.off";
}

export default function ServerTable({
  rows,
  onToggle,
  onAdopt,
}: {
  rows: ServerRow[];
  onToggle: (server: string, tool: string) => void;
  onAdopt: (server: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-1.5" id="server-table">
      {rows.map((r) => {
        const tone = statusTone(r.status);
        const label = `${r.name}: ${t(statusWord(r.status))}`;
        return (
          <div key={`${r.name}-${r.managed ? "m" : "d"}`} className="border border-deck-line rounded-deck px-3 py-2 text-sm" data-testid={`server-row-${r.name}`}>
            <button
              onClick={() => setOpen(open === r.name ? null : r.name)}
              aria-expanded={open === r.name}
              className="flex w-full flex-wrap items-center gap-2 text-left"
            >
              <Led tone={tone} label={label} />
              <span className="font-mono font-medium">{r.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  r.managed ? "border border-deck-accent/60 text-deck-accent" : "border border-dashed border-deck-line text-deck-muted"
                }`}
              >
                {r.managed ? t("mcp.badgeManaged") : t("mcp.badgeDiscovered")}
              </span>
              {r.transport && <span className="rounded-full border border-deck-line px-2 py-0.5 text-xs text-deck-muted">{r.transport}</span>}
              <span className="ml-auto font-mono text-xs text-deck-muted">
                {r.toolCount > 0 ? t("mcp.toolsCount", { n: r.toolCount }) : null}
                {r.latencyMs != null ? ` · ${r.latencyMs}ms` : ""}
              </span>
            </button>

            {r.error && <div className="mt-1 text-xs text-led-err" role="alert">{r.error}</div>}

            {open === r.name && (
              <div className="mt-2 space-y-2">
                {r.target && <p className="font-mono text-xs text-deck-muted break-all">{r.target}</p>}
                {r.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.sources.map((src) => (
                      <span key={src} className="rounded-full border border-deck-line px-2 py-0.5 text-xs text-deck-muted">← {src}</span>
                    ))}
                  </div>
                )}
                {(r.env_keys.length > 0 || r.header_keys.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...r.env_keys, ...r.header_keys].map((k) => (
                      <span key={k} className="rounded bg-deck-panel2 px-1.5 py-0.5 text-xs">🔑 {k}</span>
                    ))}
                  </div>
                )}
                {r.managed && r.disabled_tools.length > 0 && (
                  <div className="border-t border-deck-line pt-2">
                    <p className="text-xs text-deck-muted mb-1">{t("mcp.toolsOff")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.disabled_tools.map((tool) => (
                        <button
                          key={tool}
                          onClick={() => onToggle(r.name, tool)}
                          className="rounded-full border border-led-warn/50 px-2 py-0.5 text-xs hover:bg-deck-panel2"
                        >
                          {tool} ⏻
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {r.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {r.tools.map((tool) => (
                      <span key={tool.name} title={tool.description || tool.name} className="rounded-full border border-deck-line px-2 py-0.5 text-xs">
                        {tool.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  r.managed && <p className="text-xs text-deck-muted">{t("mcp.noTools")}</p>
                )}
                {!r.managed && (
                  <div className="border-t border-deck-line pt-2 space-y-1.5">
                    {/* N-R5: adoption was a bare verb on a hidden row — a
                        novice never learned what adopting does or that the
                        server came from another agent's config. Name the
                        source and the deal right next to the button. */}
                    <p
                      data-testid={`adopt-hint-${r.name}`}
                      className="text-xs text-deck-muted"
                    >
                      {t("mcp.adoptHint", { src: r.sources.join("、") || r.target || r.name })}
                    </p>
                    <button
                      onClick={() => onAdopt(r.name)}
                      data-testid={`server-adopt-${r.name}`}
                      className="rounded-deck bg-deck-accent px-2.5 py-1 text-xs font-semibold text-deck-bg"
                    >
                      {t("mcp.adoptOne")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
