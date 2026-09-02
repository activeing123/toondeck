import { useEffect, useState } from "react";
import DesignSheet from "./design/DesignSheet";

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
      <p className="text-deck-muted">One deck for every agent — scaffold M0</p>
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
      <a href="#/design" className="text-xs text-deck-muted underline">
        design directions
      </a>
    </main>
  );
}

export default function App() {
  const route = useHashRoute();
  if (route.startsWith("#/design")) return <DesignSheet />;
  return <Console />;
}
