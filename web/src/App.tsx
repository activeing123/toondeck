import { useEffect, useState } from "react";
import DesignSheet from "./design/DesignSheet";
import McpPanel from "./mcp/McpPanel";
import SkillsPanel from "./skills/SkillsPanel";

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

function Nav() {
  const link = "text-sm text-deck-muted hover:text-deck-ink";
  return (
    <nav className="flex gap-4">
      <a className={link} href="#/">deck</a>
      <a className={link} href="#/mcp">mcp</a>
      <a className={link} href="#/skills">skills</a>
      <a className={link} href="#/design">design</a>
    </nav>
  );
}

function Console() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main className="min-h-screen bg-deck-bg text-deck-ink flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">
        Toon<span className="text-deck-accent">Deck</span>
      </h1>
      <p className="text-deck-muted">One deck for every agent — M1 in progress</p>
      {health ? (
        <div className="glass rounded-deck px-6 py-4 text-sm shadow-glow-gold">
          <div>
            service <span className="text-deck-accent">{health.version}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                health.engine.available ? "bg-led-ok shadow-glow-ok" : "bg-led-err shadow-glow-err"
              }`}
            />
            mcptoon engine {health.engine.available ? health.engine.version : "unavailable"}
          </div>
        </div>
      ) : (
        <div className="text-deck-muted">connecting…</div>
      )}
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-deck-bg text-deck-ink p-8">
      <header className="flex items-center gap-6 mb-8">
        <a href="#/" className="text-xl font-bold">
          Toon<span className="text-deck-accent">Deck</span>
        </a>
        <Nav />
      </header>
      {children}
    </div>
  );
}

export default function App() {
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
  return <Console />;
}
