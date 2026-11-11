/**
 * Daily streak + Trainer Class rules (pure functions, storage-agnostic).
 *
 *  - Completing all five prompts completes the day, whatever the score.
 *  - Completing day D right after day D-1 extends the streak; any gap resets it to 1.
 *  - Recording the same day twice is a no-op (reloads can't inflate streaks).
 *  - A streak is still "alive" today if the last completion was today or yesterday.
 */
import { TRAINER_CLASSES, UNRANKED_CLASS_NAME } from "@/config/game";
import { daysBetween } from "@/lib/dates";
import type { BallTier, SynergyTierId } from "@/config/game";

export interface DayResult {
  date: string;
  /** Final score (rarity × Team Synergy). Older saves: rarity score only. */
  score: number;
  /** Rarity points before Team Synergy (absent in pre-synergy saves). */
  baseScore?: number;
  synergyTier?: SynergyTierId;
  multiplier?: number;
  tiers: (BallTier | null)[];
  completedAt: string;
}

export interface PlayerProgress {
  schemaVersion: 1;
  currentStreak: number;
  bestStreak: number;
  lastCompletedDate: string | null;
  totalCompleted: number;
  history: Record<string, DayResult>;
}

export function emptyProgress(): PlayerProgress {
  return { schemaVersion: 1, currentStreak: 0, bestStreak: 0, lastCompletedDate: null, totalCompleted: 0, history: {} };
}

export function recordCompletion(progress: PlayerProgress, result: DayResult): PlayerProgress {
  if (progress.history[result.date]) return progress; // idempotent

  const history = { ...progress.history, [result.date]: result };
  const last = progress.lastCompletedDate;
  let { currentStreak, lastCompletedDate } = progress;

  if (!last || daysBetween(last, result.date) > 0) {
    // Moving forward in time.
    currentStreak = last && daysBetween(last, result.date) === 1 ? progress.currentStreak + 1 : 1;
    lastCompletedDate = result.date;
  } else {
    // Back-filling an older date (only possible in dev mode) — recompute from history.
    currentStreak = streakEndingAt(history, last);
  }

  return {
    ...progress,
    history,
    currentStreak,
    lastCompletedDate,
    bestStreak: Math.max(progress.bestStreak, currentStreak),
    totalCompleted: progress.totalCompleted + 1,
  };
}

function streakEndingAt(history: Record<string, DayResult>, end: string): number {
  let n = 0;
  const dates = new Set(Object.keys(history));
  let d = end;
  while (dates.has(d)) {
    n++;
    d = new Date(Date.parse(d + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
  }
  return n;
}

/** Streak as it should be displayed on `today` (0 if a day was missed). */
export function activeStreak(progress: PlayerProgress, today: string): number {
  if (!progress.lastCompletedDate) return 0;
  const gap = daysBetween(progress.lastCompletedDate, today);
  return gap === 0 || gap === 1 ? progress.currentStreak : 0;
}

export interface TrainerClassInfo {
  name: string;
  streak: number;
  next: { name: string; minStreak: number } | null;
  daysToNext: number;
  /** 0–1: current streak as a fraction of the next class's requirement. */
  progress: number;
}

export function trainerClassFor(streak: number): TrainerClassInfo {
  let idx = -1;
  TRAINER_CLASSES.forEach((c, i) => {
    if (streak >= c.minStreak) idx = i;
  });
  const current = idx >= 0 ? TRAINER_CLASSES[idx] : null;
  const next = TRAINER_CLASSES[idx + 1] ?? null;
  return {
    name: current?.name ?? UNRANKED_CLASS_NAME,
    streak,
    next: next ? { name: next.name, minStreak: next.minStreak } : null,
    daysToNext: next ? next.minStreak - streak : 0,
    progress: next ? Math.min(1, streak / next.minStreak) : 1,
  };
}
