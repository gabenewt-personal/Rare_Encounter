/**
 * Persistence boundary. The game only talks to the `GameStore` interface, so a
 * cloud implementation (e.g. Supabase keyed by user id) can replace
 * LocalStorageStore later without touching gameplay or UI code.
 */
import { emptyProgress, type PlayerProgress } from "@/lib/progress/streak";
import type { DailySession } from "@/lib/session";

export interface GameStore {
  loadProgress(): PlayerProgress;
  saveProgress(progress: PlayerProgress): void;
  loadSession(date: string): DailySession | null;
  saveSession(session: DailySession): void;
  getSetting<T>(key: string, fallback: T): T;
  setSetting<T>(key: string, value: T): void;
  /** Clears everything in this namespace (used by dev tools). */
  reset(): void;
}

const PREFIX = "rare-encounter:v1";

/** Storage that survives private mode / disabled storage by falling back to memory. */
function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length"> {
  try {
    const k = "__re_probe__";
    window.localStorage.setItem(k, k);
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
  }
}

export class LocalStorageStore implements GameStore {
  private storage = safeStorage();
  /** `namespace` isolates dev-mode data from real progress. */
  constructor(private namespace: "live" | "dev" = "live") {}

  private key(k: string) {
    return `${PREFIX}:${this.namespace}:${k}`;
  }
  private read<T>(k: string): T | null {
    try {
      const raw = this.storage.getItem(this.key(k));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  private write(k: string, v: unknown) {
    try {
      this.storage.setItem(this.key(k), JSON.stringify(v));
    } catch {
      /* quota / disabled — progress just won't persist */
    }
  }

  loadProgress(): PlayerProgress {
    const p = this.read<PlayerProgress>("progress");
    return p && p.schemaVersion === 1 ? p : emptyProgress();
  }
  saveProgress(progress: PlayerProgress) {
    this.write("progress", progress);
  }
  loadSession(date: string): DailySession | null {
    const s = this.read<DailySession>(`session:${date}`);
    return s && s.schemaVersion === 1 ? s : null;
  }
  saveSession(session: DailySession) {
    this.write(`session:${session.date}`, session);
  }
  getSetting<T>(key: string, fallback: T): T {
    return this.read<T>(`setting:${key}`) ?? fallback;
  }
  setSetting<T>(key: string, value: T) {
    this.write(`setting:${key}`, value);
  }
  reset() {
    const prefix = this.key("");
    const doomed: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k?.startsWith(prefix)) doomed.push(k);
    }
    doomed.forEach((k) => this.storage.removeItem(k));
  }
}

/** In-memory store for tests and server rendering. */
export class MemoryStore implements GameStore {
  private progress = emptyProgress();
  private sessions = new Map<string, DailySession>();
  private settings = new Map<string, unknown>();
  loadProgress() {
    return structuredClone(this.progress);
  }
  saveProgress(p: PlayerProgress) {
    this.progress = structuredClone(p);
  }
  loadSession(date: string) {
    const s = this.sessions.get(date);
    return s ? structuredClone(s) : null;
  }
  saveSession(s: DailySession) {
    this.sessions.set(s.date, structuredClone(s));
  }
  getSetting<T>(key: string, fallback: T): T {
    return (this.settings.get(key) as T) ?? fallback;
  }
  setSetting<T>(key: string, value: T) {
    this.settings.set(key, value);
  }
  reset() {
    this.progress = emptyProgress();
    this.sessions.clear();
    this.settings.clear();
  }
}
