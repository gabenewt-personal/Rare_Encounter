/**
 * Browser-only helpers shared by every page: which date/save namespace is
 * active (live vs dev mode), user settings, and motion preferences.
 */
import { dateKeyFor, isDateKey } from "@/lib/dates";
import { LocalStorageStore, type GameStore } from "@/lib/progress/store";

export interface ClientContext {
  isDev: boolean;
  /** Challenge date in effect (UTC date key). */
  date: string;
  store: GameStore;
}

export function readClientContext(): ClientContext {
  const params = new URLSearchParams(window.location.search);
  const isDev = params.get("dev") === "1";
  const requested = params.get("date");
  const date = isDev && isDateKey(requested) ? requested : dateKeyFor();
  return { isDev, date, store: new LocalStorageStore(isDev ? "dev" : "live") };
}

/** Builds an in-app href that keeps dev-mode parameters. */
export function appHref(path: string, ctx: Pick<ClientContext, "isDev" | "date">): string {
  return ctx.isDev ? `${path}?dev=1&date=${ctx.date}` : path;
}

/* ---------------- Settings ---------------- */

export type MotionSetting = "system" | "reduced" | "full";

export interface Settings {
  sound: boolean;
  motion: MotionSetting;
}

export function loadSettings(store: GameStore): Settings {
  return { sound: store.getSetting("sound", false), motion: store.getSetting<MotionSetting>("motion", "system") };
}

export function saveSettings(store: GameStore, s: Settings) {
  store.setSetting("sound", s.sound);
  store.setSetting("motion", s.motion);
  applyMotionSetting(s.motion);
}

/** Mirrors the motion setting onto <html data-motion> for CSS. */
export function applyMotionSetting(m: MotionSetting) {
  if (m === "system") delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = m;
}

/** True when animations should be minimised (setting overrides the OS). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const m = document.documentElement.dataset.motion;
  if (m === "reduced") return true;
  if (m === "full") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
