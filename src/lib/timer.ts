/**
 * Wall-clock question timer (pure, mode-agnostic — Survival Mode reuses it).
 *
 * A timer is just the epoch-ms instant it started. Remaining time is always
 * recomputed from the clock, so it stays correct across re-renders, page
 * refreshes and backgrounded tabs (the clock keeps running while you're away).
 */
import { QUESTION_TIME_LIMIT_SECONDS, TIMER_URGENT_SECONDS } from "@/config/game";

export const QUESTION_TIME_LIMIT_MS = QUESTION_TIME_LIMIT_SECONDS * 1000;

export function remainingMs(startedAt: number, now: number, limitMs = QUESTION_TIME_LIMIT_MS): number {
  return Math.max(0, Math.min(limitMs, limitMs - (now - startedAt)));
}

export function isExpired(startedAt: number, now: number, limitMs = QUESTION_TIME_LIMIT_MS): boolean {
  return remainingMs(startedAt, now, limitMs) <= 0;
}

/** Whole seconds shown on the counter (20 … 1, then 0 only when expired). */
export function displaySeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

export function isUrgent(ms: number): boolean {
  return ms > 0 && ms <= TIMER_URGENT_SECONDS * 1000;
}
