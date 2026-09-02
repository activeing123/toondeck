import { useEffect, useState } from "react";
import AgentsPanel from "./agents/AgentsPanel";
import DesignSheet from "./design/DesignSheet";
import { I18nProvider, useI18n, type Lang } from "./i18n";
import LogsPanel from "./logs/LogsPanel";
import McpPanel from "./mcp/McpPanel";
import SkillsPanel from "./skills/SkillsPanel";
import VaultPanel from "./vault/VaultPanel";

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

type Health = {
  ok: boolean;
  service: string;
  version: string;
  engine: { available: boolean; version: string | null };
};

type AgentRow = {
  id: string;
  display_name: string;
  installed: boolean;
  evidence: Record<string, boolean>;
};

function AgentGrid() {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((b) => setAgents(b.agents))
      .catch(() => setAgents(null));
  }, []);
  if (!agents) return null;
  return (
    <div className="glass rounded-deck px-5 py-3 text-sm w-full max-w-md">
      <div className="text-xs text-deck-muted uppercase tracking-wide mb-2">
        agents on this machine
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                a.installed ? "bg-led-ok shadow-glow-ok" : "bg-deck-muted"
              }`}
            />
            <span className={a.installed ? "" : "text-deck-muted"}>{a.display_name}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-right">
        <a className="text-xs text-deck-accent hover:underline" href="#/skills">
          manage skills →
        </a>
      </div>
    </div>
  );
}

const NAV = [
  { hash: "#/", key: "nav.deck", icon: "🃏" },
  { hash: "#/mcp", key: "nav.mcp", icon: "🔌" },
  { hash: "#/skills", key: "nav.skills", icon: "🧩" },
  { hash: "#/agents", key: "nav.agents", icon: "🤖" },
  { hash: "#/logs", key: "nav.logs", icon: "📜" },
  { hash: "#/vault", key: "nav.vault", icon: "🔐" },
  { hash: "#/design", key: "nav.design", icon: "🎨" },
];

type StatusHealth = {
  ok: boolean;
  version: string;
  engine: { available: boolean; version: string | null };
};

function Sidebar({ route }: { route: string }) {
  const { t, lang, setLang } = useI18n();
  const [health, setHealth] = useState<StatusHealth | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);
  return (
    <aside className="w-56 shrink-0 border-r border-deck-line flex flex-col p-4 gap-1 min-h-screen">
      <a href="#/" className="text-xl font-bold mb-6">
        Toon<span className="text-deck-accent">Deck</span>
      </a>
      {NAV.map((n) => {
        const active = n.hash === "#/" ? route === "#/" || route === "#" : route.startsWith(n.hash);
        return (
          <a
            key={n.hash}
            href={n.hash}
            className={`flex items-center gap-2.5 rounded-deck px-3 py-2 text-sm ${
              active ? "bg-deck-panel2 text-deck-ink font-semibold" : "text-deck-muted hover:text-deck-ink"
            }`}
          >
            <span>{n.icon}</span>
            {t(n.key)}
          </a>
        );
      })}
      <div className="mt-auto space-y-2 text-xs text-deck-muted">
        <div className="flex gap-1">
          {(["en", "zh"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-deck border px-2 py-0.5 ${
                lang === l ? "border-deck-accent text-deck-accent" : "border-deck-line"
              }`}
            >
              {l === "en" ? "EN" : "中文"}
            </button>
          ))}
        </div>
        {health ? (
          <>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  health.engine?.available ? "bg-led-ok shadow-glow-ok" : "bg-led-err"
                }`}
              />
              {t("status.engine")} mcptoon{" "}
              {health.engine?.available ? health.engine.version : t("status.offline")}
            </div>
            <div>deck v{health.version}</div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-led-warn" />
            {t("status.offline")}
          </div>
        )}
      </div>
    </aside>
  );
}

function ConsoleTagline() {
  const { t } = useI18n();
  return (
    <p className="text-deck-muted">
      {t("brand.tagline")}
      <span className="ml-2 rounded-full border border-deck-line px-2 py-0.5 text-xs">
        powered by mcptoon
      </span>
    </p>
  );
}

function ConsoleMcpSummary({ mcp }: { mcp: { server_total: number; tool_total: number } | null }) {
  if (!mcp) return null;
  return (
    <div className="text-sm text-deck-muted">
      🔌 {mcp.server_total} MCP servers · {mcp.tool_total ?? "…"} tools
    </div>
  );
}

/** UX-D1: first-screen onboarding — tell the user what to do FIRST. */
function ConsoleOnboarding({ mcp }: { mcp: { server_total: number; tool_total: number } | null }) {
  const { t } = useI18n();
  if (!mcp) return null; // still loading — the card waits for honest data
  if (mcp.server_total === 0) {
    return (
      <div className="glass rounded-deck px-6 py-4 text-sm space-y-2 max-w-md border border-deck-accent/40">
        <div className="font-semibold">{t("onboard.step1")}</div>
        <p className="text-deck-muted">{t("onboard.step1Body")}</p>
        <a href="#/mcp" className="inline-block text-deck-accent hover:underline">
          {t("onboard.goMcp")}
        </a>
      </div>
    );
  }
  return (
    <div className="glass rounded-deck px-6 py-4 text-sm space-y-2 max-w-md">
      <div className="font-semibold">{t("onboard.step2")}</div>
      <p className="text-deck-muted">
        {t("onboard.step2Body", { servers: mcp.server_total, tools: mcp.tool_total })}
      </p>
      <a href="#/agents" className="inline-block text-deck-accent hover:underline">
        {t("onboard.goAgents")}
      </a>
    </div>
  );
}

function Console() {
  const [health, setHealth] = useState<Health | null>(null);
  const [mcp, setMcp] = useState<{ server_total: number; tool_total: number } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    fetch("/api/mcp/state")
      .then((r) => r.json())
      .then(setMcp)
      .catch(() => setMcp(null));
  }, []);

  return (
    <main className="min-h-screen bg-deck-bg text-deck-ink flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">
        Toon<span className="text-deck-accent">Deck</span>
      </h1>
      <ConsoleTagline />
      <ConsoleOnboarding mcp={mcp} />
      {health ? (
        <div className="glass rounded-deck px-6 py-4 text-sm shadow-glow-gold space-y-1">
          <div>
            service <span className="text-deck-accent">{health.version}</span> ·{" "}
            <span className="font-mono">127.0.0.1:8721</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                health.engine.available ? "bg-led-ok shadow-glow-ok" : "bg-led-err shadow-glow-err"
              }`}
            />
            mcptoon engine {health.engine.available ? health.engine.version : "unavailable"}
          </div>
          <ConsoleMcpSummary mcp={mcp} />
        </div>
      ) : (
        <div className="text-deck-muted">connecting…</div>
      )}
      <AgentGrid />
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const route = useHashRoute();
  return (
    <div className="min-h-screen bg-deck-bg text-deck-ink flex">
      <Sidebar route={route} />
      <main className="flex-1 p-8 max-w-6xl">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Routed />
    </I18nProvider>
  );
}

function Routed() {
  const route = useHashRoute();
  if (route.startsWith("#/design")) {
    return (
      <Shell>
        <DesignSheet />
      </Shell>
    );
  }
  if (route.startsWith("#/mcp")) {
    return (
      <Shell>
        <McpPanel />
      </Shell>
    );
  }
  if (route.startsWith("#/skills")) {
    return (
      <Shell>
        <SkillsPanel />
      </Shell>
    );
  }
  if (route.startsWith("#/agents")) {
    return (
      <Shell>
        <AgentsPanel />
      </Shell>
    );
  }
  if (route.startsWith("#/logs")) {
    return (
      <Shell>
        <LogsPanel />
      </Shell>
    );
  }
  if (route.startsWith("#/vault")) {
    return (
      <Shell>
        <VaultPanel />
      </Shell>
    );
  }
  return <Console />;
}
