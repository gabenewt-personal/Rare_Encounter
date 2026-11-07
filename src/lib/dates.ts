/**
 * Challenge dates. A "date key" is YYYY-MM-DD in the game's global reset
 * timezone (UTC by default), so every player worldwide shares one challenge.
 */
import { CHALLENGE_EPOCH, RESET_UTC_OFFSET_HOURS } from "@/config/game";

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The challenge date that is active at instant `now`. */
export function dateKeyFor(now: Date = new Date(), offsetHours = RESET_UTC_OFFSET_HOURS): string {
  return new Date(now.getTime() + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

function toUtcMs(key: string): number {
  return Date.parse(key + "T00:00:00Z");
}

export function addDays(key: string, days: number): string {
  return new Date(toUtcMs(key) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** Challenge #1 is the epoch date. */
export function challengeNumber(key: string): number {
  return daysBetween(CHALLENGE_EPOCH, key) + 1;
}

/** Milliseconds until the next global reset. */
export function msUntilReset(now: Date = new Date(), offsetHours = RESET_UTC_OFFSET_HOURS): number {
  const next = toUtcMs(addDays(dateKeyFor(now, offsetHours), 1)) - offsetHours * 3_600_000;
  return Math.max(0, next - now.getTime());
}

/** The instant of the next global reset. */
export function nextResetAt(now: Date = new Date(), offsetHours = RESET_UTC_OFFSET_HOURS): Date {
  return new Date(now.getTime() + msUntilReset(now, offsetHours));
}

export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function formatDateLabel(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
}
