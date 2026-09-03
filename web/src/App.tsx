import { useEffect, useRef, useState } from "react";
import AgentsPanel from "./agents/AgentsPanel";
import DesignSheet from "./design/DesignSheet";
import { I18nProvider, useI18n, type Lang } from "./i18n";
import { Led } from "./ui/Led";
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

// R29: single-key nav. Digits 1..7 jump to the matching sidebar tab, Gmail
// style — but never while the user is typing in an input/textarea/select or
// inside a contenteditable.
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

function useDigitNav() {
  const route = useHashRoute();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = Number(e.key);
      const nav = prodNav();
      if (!Number.isInteger(idx) || idx < 1 || idx > nav.length) return;
      if (isTypingTarget(e.target)) return;
      const target = nav[idx - 1];
      if (target && window.location.hash !== target.hash) {
        window.location.hash = target.hash;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return route;
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

function AgentGrid({ agents }: { agents: AgentRow[] | null }) {
  const { t } = useI18n();
  if (!agents) return null;
  return (
    <div className="glass rounded-deck px-5 py-3 text-sm w-full max-w-md">
      <div className="text-xs text-deck-muted uppercase tracking-wide mb-2">
        agents on this machine
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <Led tone={a.installed ? "ok" : "off"} label={`${a.display_name}: ${t(a.installed ? "led.installed" : "led.notInstalled")}`} />
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

// R37: the design veto sheet is a dev tool — it never ships in the
// production nav. NAV entries carry a `dev` flag; both navs filter through
// prodNav(). The route stays deep-linkable for the development workflow.
// The escape hatch is runtime, not build-time: localStorage "toondeck.dev=1"
// re-reveals the dev tab (a console one-liner, no rebuild needed).
type NavItem = { hash: string; key: string; icon: string; dev?: boolean };

const NAV: NavItem[] = [
  { hash: "#/", key: "nav.deck", icon: "🃏" },
  { hash: "#/mcp", key: "nav.mcp", icon: "🔌" },
  { hash: "#/skills", key: "nav.skills", icon: "🧩" },
  { hash: "#/agents", key: "nav.agents", icon: "🤖" },
  { hash: "#/logs", key: "nav.logs", icon: "📜" },
  { hash: "#/vault", key: "nav.vault", icon: "🔐" },
  { hash: "#/design", key: "nav.design", icon: "🎨", dev: true },
];

export function devMode(): boolean {
  try {
    return window.localStorage.getItem("toondeck.dev") === "1";
  } catch {
    return false;
  }
}

const prodNav = (): NavItem[] => NAV.filter((n) => !n.dev || devMode());

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
    <aside role="complementary" aria-label="deck nav" className="hidden md:flex w-56 shrink-0 border-r border-deck-line flex-col p-4 gap-1 min-h-screen">
      <a href="#/" className="text-xl font-bold mb-6">
        Toon<span className="text-deck-accent">Deck</span>
      </a>
      <nav aria-label="sections" className="flex flex-col gap-1">
        {prodNav().map((n) => {
          const active = n.hash === "#/" ? route === "#/" || route === "#" : route.startsWith(n.hash);
          return (
            <a
              key={n.hash}
              href={n.hash}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-deck px-3 py-2 text-sm ${
                active ? "bg-deck-panel2 text-deck-ink font-semibold" : "text-deck-muted hover:text-deck-ink"
              }`}
            >
              <span>{n.icon}</span>
              {t(n.key)}
            </a>
          );
        })}
      </nav>
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
              <Led tone={health.engine?.available ? "ok" : "err"} />
              {t("status.engine")} mcptoon{" "}
              {health.engine?.available ? health.engine.version : t("status.offline")}
            </div>
            <div>deck v{health.version}</div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <Led tone="warn" />
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

function ConsoleMcpSummary({ inv }: { inv: { adopted_total: number; tools_total: number } | null }) {
  if (!inv) return null;
  return (
    <div className="text-sm text-deck-muted">
      🔌 {inv.adopted_total} MCP servers · {inv.tools_total} tools
    </div>
  );
}

/**
 * UX-D1 + R40: first-screen onboarding — tell the user what to do FIRST.
 * Decision tree, most-blocking problem wins, one honest card at a time:
 * 1. MCP inventory not loaded yet          → wait (no guessing)
 * 2. 0 MCP servers adopted                 → MCP discovery
 * 3. agents known but none installed       → install/launch guidance
 * 4. skills shelf empty (total === 0)      → skills import guidance
 * 5. fleet healthy                         → step-2 numbers card
 * Failed side-fetches (agents/skills) hide their branch instead of guessing.
 */
function ConsoleOnboarding({
  inv,
  agents,
  skillsTotal,
}: {
  inv: { adopted_total: number; tools_total: number } | null;
  agents: AgentRow[] | null;
  skillsTotal: number | null;
}) {
  const { t } = useI18n();
  if (!inv) return null; // still loading — the card waits for honest data
  if (inv.adopted_total === 0) {
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
  if (agents && agents.length > 0 && agents.every((a) => !a.installed)) {
    return (
      <div className="glass rounded-deck px-6 py-4 text-sm space-y-2 max-w-md border border-deck-accent/40">
        <div className="font-semibold">{t("onboard.step2")}</div>
        <p className="text-deck-muted">{t("onboard.noAgentBody")}</p>
        <a href="#/agents" className="inline-block text-deck-accent hover:underline">
          {t("onboard.goAgents")}
        </a>
      </div>
    );
  }
  if (skillsTotal === 0) {
    return (
      <div className="glass rounded-deck px-6 py-4 text-sm space-y-2 max-w-md border border-deck-accent/40">
        <div className="font-semibold">{t("onboard.noSkills")}</div>
        <p className="text-deck-muted">{t("onboard.noSkillsBody")}</p>
        <a href="#/skills" className="inline-block text-deck-accent hover:underline">
          {t("onboard.goSkills")}
        </a>
      </div>
    );
  }
  return (
    <div className="glass rounded-deck px-6 py-4 text-sm space-y-2 max-w-md">
      <div className="font-semibold">{t("onboard.step2")}</div>
      <p className="text-deck-muted">
        {t("onboard.step2Body", { servers: inv.adopted_total, tools: inv.tools_total })}
      </p>
      <a href="#/agents" className="inline-block text-deck-accent hover:underline">
        {t("onboard.goAgents")}
      </a>
    </div>
  );
}

function Console() {
  const [health, setHealth] = useState<Health | null>(null);
  // R25 bugfix: the card used to read /api/mcp/state, which has no top-level
  // tool count — the landing page literally interpolated "undefined tools".
  // The honest source is /api/mcp/tools (cached inventory, also warms the
  // MCP page's cache). Shape-guarded: a malformed payload hides the card
  // instead of faking zeros.
  const [inv, setInv] = useState<{ adopted_total: number; tools_total: number } | null>(null);
  // R40: shared state for onboarding decisions + the agent grid — one fetch
  // per endpoint, no duplicate requests.
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [skillsTotal, setSkillsTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    fetch("/api/mcp/tools")
      .then((r) => r.json())
      .then((b) => {
        if (typeof b?.adopted_total === "number" && typeof b?.tools_total === "number") {
          setInv({ adopted_total: b.adopted_total, tools_total: b.tools_total });
        } else {
          setInv(null); // never guess — no honest numbers, no card
        }
      })
      .catch(() => setInv(null));
    fetch("/api/agents")
      .then((r) => r.json())
      .then((b) => setAgents(Array.isArray(b?.agents) ? b.agents : null))
      .catch(() => setAgents(null));
    fetch("/api/skills/state")
      .then((r) => r.json())
      .then((b) =>
        setSkillsTotal(typeof b?.counts?.total === "number" ? b.counts.total : null),
      )
      .catch(() => setSkillsTotal(null));
  }, []);

  return (
    <main className="min-h-screen bg-deck-bg text-deck-ink flex flex-col items-center justify-center gap-6">
      <PageFocus viewTag="console">
        <h1 className="text-4xl font-bold tracking-tight">
          Toon<span className="text-deck-accent">Deck</span>
        </h1>
        <ConsoleTagline />
        <ConsoleOnboarding inv={inv} agents={agents} skillsTotal={skillsTotal} />
      </PageFocus>
      {health ? (
        <div className="glass rounded-deck px-6 py-4 text-sm shadow-glow-gold space-y-1">
          <div>
            service <span className="text-deck-accent">{health.version}</span> ·{" "}
            <span className="font-mono">127.0.0.1:8721</span>
          </div>
          <div className="flex items-center gap-2">
            <Led tone={health.engine.available ? "ok" : "err"} />
            mcptoon engine {health.engine.available ? health.engine.version : "unavailable"}
          </div>
          <ConsoleMcpSummary inv={inv} />
        </div>
      ) : (
        <div className="text-deck-muted">connecting…</div>
      )}
      <AgentGrid agents={agents} />
    </main>
  );
}

/** R29: keyboard users land at the top of new content after a route change. */
function PageFocus({ viewTag, children }: { viewTag: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, [viewTag]);
  return (
    <div
      ref={ref}
      data-route-focus="true"
      tabIndex={-1}
      className="outline-none"
    >
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const route = useHashRoute();
  return (
    <div className="min-h-screen bg-deck-bg text-deck-ink flex">
      <Sidebar route={route} />
      <div className="flex-1 min-w-0">
        {/* R31: below md the sidebar is gone — this horizontal tab bar is the nav */}
        <nav
          aria-label="tabs"
          className="md:hidden flex gap-1 overflow-x-auto border-b border-deck-line px-3 py-2"
        >
          {prodNav().map((n) => {
            const active = n.hash === "#/" ? route === "#/" || route === "#" : route.startsWith(n.hash);
            return <MobileTab key={n.hash} n={n} active={active} />;
          })}
        </nav>
        <main className="flex-1 p-4 md:p-8 max-w-6xl">
          <PageFocus viewTag={route}>{children}</PageFocus>
        </main>
      </div>
    </div>
  );
}

function MobileTab({ n, active }: { n: { hash: string; key: string; icon: string }; active: boolean }) {
  const { t } = useI18n();
  return (
    <a
      href={n.hash}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-deck px-3 py-1.5 text-sm ${
        active ? "bg-deck-panel2 text-deck-ink font-semibold" : "text-deck-muted"
      }`}
    >
      <span>{n.icon}</span>
      {t(n.key)}
    </a>
  );
}

export default function App() {
  useDigitNav();
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
