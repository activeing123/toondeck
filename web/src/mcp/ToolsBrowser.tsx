import { useState } from "react";
import { useI18n } from "../i18n";
import { Led } from "../ui/Led";

type ToolRow = { server: string; status: string; latency_ms: number; error: string | null; tools: { name: string; description: string }[] };

export function fetchTools(): Promise<{ checked: number; servers: ToolRow[] }> {
  return fetch("/api/mcp/tools").then((r) => r.json());
}

function statusTone(status: string): "ok" | "warn" | "err" {
  if (status === "ok") return "ok";
  if (status === "timeout") return "warn";
  return "err";
}

/** Live tool inventory per server — the mcptoon engine's muscle, on display. */
export default function ToolsBrowser() {
  const { t } = useI18n();
  const [data, setData] = useState<{ checked: number; servers: ToolRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchTools()
      .then(setData)
      .finally(() => setLoading(false));
  };

  return (
    <section id="tools-browser" className="glass rounded-deck p-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">🧰 {t("mcp.tools")}</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-deck border border-deck-line px-3 py-1 text-sm hover:bg-deck-panel2 disabled:opacity-40"
        >
          {loading ? "…" : t("mcp.browse")}
        </button>
        {data && (
          <span className="text-xs text-deck-muted">
            {data.servers.reduce((n, s) => n + s.tools.length, 0)} tools · {data.checked} servers
          </span>
        )}
      </div>

      {data && (
        <div className="mt-3 space-y-1.5">
          {data.servers.map((s) => (
            <div key={s.server} className="border border-deck-line rounded-deck px-3 py-2 text-sm">
              <button
                onClick={() => setOpen(open === s.server ? null : s.server)}
                className="flex w-full items-center gap-2 text-left"
              >
                <Led tone={statusTone(s.status)} label={`${s.server}: ${t(s.status === "ok" ? "led.ok" : s.status === "timeout" ? "led.timeout" : "led.err")}`} />
                <span className="font-mono font-medium">{s.server}</span>
                <span className="ml-auto font-mono text-xs text-deck-muted">
                  {s.tools.length} tools · {s.latency_ms}ms
                </span>
              </button>
              {s.error && <div className="mt-1 text-xs text-led-err">{s.error}</div>}
              {open === s.server && s.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.tools.map((tool) => (
                    <span
                      key={tool.name}
                      title={tool.description || tool.name}
                      className="rounded-full border border-deck-line px-2 py-0.5 text-xs"
                    >
                      {tool.name}
                    </span>
                  ))}
                </div>
              )}
              {open === s.server && s.tools.length === 0 && !s.error && (
                <div className="mt-1 text-xs text-deck-muted">no tools exposed</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
