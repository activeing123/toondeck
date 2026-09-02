import { useEffect, useState } from "react";

type Health = {
  ok: boolean;
  service: string;
  version: string;
  engine: { available: boolean; version: string | null };
};

export default function App() {
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
        <div className="rounded-xl border border-deck-line bg-deck-panel px-6 py-4 text-sm">
          <div>
            service <span className="text-deck-accent">{health.version}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                health.engine.available ? "bg-led-ok" : "bg-led-err"
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
