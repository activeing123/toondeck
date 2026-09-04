import { useEffect, useRef, useState } from "react";
import AgentsPanel from "./agents/AgentsPanel";
import DesignSheet from "./design/DesignSheet";
import { I18nProvider, useI18n, type Lang } from "./i18n";
import { Led } from "./ui/Led";
import HelpFooter from "./ui/HelpFooter";
import { markChecklistDone } from "./ui/StarterChecklist";
import LogsPanel from "./logs/LogsPanel";
import McpPanel from "./mcp/McpPanel";
import LockScreen, { portalUnlocked } from "./portal/LockScreen";
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

// R37: the design veto sheet is a dev tool — it never ships in the
// production nav. NAV entries carry a `dev` flag; both navs filter through
// prodNav(). The route stays deep-linkable for the development workflow.
// The escape hatch is runtime, not build-time: localStorage "toondeck.dev=1"
// re-reveals the dev tab (a console one-liner, no rebuild needed).
type NavItem = { hash: string; key: string; icon: string; dev?: boolean };

const NAV: NavItem[] = [
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
        <PortalSecurity />
      </div>
    </aside>
  );
}

/** R53: per-tab session lock + password change — the gate stays honest. */
function PortalSecurity() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    const r = await fetch("/api/portal/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: cur, new: nw }),
    }).then((x) => x.json());
    if (r.ok) {
      setMsg(t("portal.changeDone"));
      setCur("");
      setNw("");
      markChecklistDone("pw"); // N-R2: first-hour step sealed
    } else {
      setMsg(r.error ?? "failed");
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        data-testid="portal-lock"
        onClick={() => {
          sessionStorage.removeItem("toondeck.portal");
          window.location.hash = "#/";
        }}
        className="rounded-deck border border-deck-line px-2 py-1 hover:text-deck-ink"
      >
        🔒 {t("portal.lock")}
      </button>{" "}
      <button
        data-testid="portal-change"
        onClick={() => setOpen((v) => !v)}
        className="rounded-deck border border-deck-line px-2 py-1 hover:text-deck-ink"
      >
        {t("portal.change")}
      </button>
      {open && (
        <div className="space-y-1.5">
          <input
            type="password"
            data-testid="portal-cur"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder={t("portal.currentPw")}
            className="w-full rounded-deck border border-deck-line bg-deck-panel px-2 py-1"
          />
          <input
            type="password"
            data-testid="portal-new"
            value={nw}
            onChange={(e) => setNw(e.target.value)}
            placeholder={t("portal.newPw")}
            className="w-full rounded-deck border border-deck-line bg-deck-panel px-2 py-1"
          />
          <button
            data-testid="portal-save"
            onClick={save}
            disabled={!cur || !nw}
            className="rounded-deck bg-deck-accent px-2 py-1 font-semibold text-deck-bg disabled:opacity-40"
          >
            {t("agents.save")}
          </button>
        </div>
      )}
      {msg && (
        <p className="text-xs" role="status">
          {msg}
        </p>
      )}
    </div>
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
      <div className="flex-1 min-w-0 flex flex-col">
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
        <HelpFooter />
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
  // R53: #/ is the portal gate. Unauthenticated → lock screen (no shell);
  // authenticated → straight into the console (#/mcp). No landing page.
  if (route === "#/" || route === "#" || route === "") {
    if (!portalUnlocked()) {
      return (
        <LockScreen
          onUnlock={() => {
            window.location.hash = "#/mcp";
          }}
        />
      );
    }
    window.location.hash = "#/mcp";
    return null;
  }
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
  // unknown route → the console, not a dead end
  window.location.hash = "#/mcp";
  return null;
}
