export type SkillEntry = {
  dirname: string;
  valid: boolean;
  name: string | null;
  description: string | null;
  errors: string[];
};

export type SkillsState = {
  source: string;
  exists: boolean;
  skills: SkillEntry[];
  counts: { total: number; valid: number };
};

export type SyncAgentResult = { agent: string; ok: boolean; actions: string[]; error?: string };

export type ViewReport = { agent: string; ok: boolean; issues: string[] };

export type DoctorReport = {
  source: { exists: boolean; total: number; invalid: string[]; lint: Record<string, string[]> };
  views: ViewReport[];
  graveyard: { removed: number };
  summary: string;
};

export type WatcherStatus = {
  ok: boolean;
  running: boolean;
  events?: number;
  last_actions?: string[];
  last_sync_ts?: string | null;
  error?: string | null;
};

export async function fetchSkillsState(): Promise<SkillsState> {
  return fetch("/api/skills/state").then((r) => r.json());
}

export function requestSkillsSync(): Promise<SyncAgentResult[]> {
  return fetch("/api/skills/sync", { method: "POST" })
    .then((r) => r.json())
    .then((b) => b.results);
}

// UX-017: single-skill sync — unknown name → 200 ok:false (deck-level contract)
export function syncSkill(name: string): Promise<{ ok: boolean; error?: string }> {
  return fetch(`/api/skills/sync/${encodeURIComponent(name)}`, { method: "POST" }).then((r) =>
    r.json(),
  );
}

export function fetchDoctor(): Promise<DoctorReport> {
  return fetch("/api/skills/doctor").then((r) => r.json());
}

export function removeSkill(name: string): Promise<{ ok: boolean; error?: string }> {
  return fetch("/api/skills/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((r) => r.json());
}

export function watcherPost(action: "start" | "stop"): Promise<WatcherStatus> {
  return fetch("/api/skills/watcher", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).then((r) => r.json());
}

export function watcherGet(): Promise<WatcherStatus> {
  return fetch("/api/skills/watcher").then((r) => r.json());
}
