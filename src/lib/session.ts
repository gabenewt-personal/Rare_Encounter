/**
 * One player's attempt at one daily challenge. Pure state transitions; the
 * caller persists the returned objects through a GameStore.
 */
import type { BallTier } from "@/config/game";
import { TIERS } from "@/config/game";
import type { DailyChallenge } from "@/lib/questions";
import type { GameStore } from "@/lib/progress/store";
import { recordCompletion, type PlayerProgress } from "@/lib/progress/streak";
import { isExpired, QUESTION_TIME_LIMIT_MS, remainingMs } from "@/lib/timer";
import type { ValidationResult } from "@/lib/validation";

export type AnswerOutcome = "correct" | "incorrect" | "timeout";

export interface AnswerRecord {
  questionId: string;
  /** null when the timer ran out before a valid Pokémon was submitted. */
  speciesId: number | null;
  correct: boolean;
  /** Older saves lack this; derive with `outcomeOf`. */
  outcome?: AnswerOutcome;
  tier: BallTier | null;
  points: number;
  share: number;
  /** Regional-form pokemon id, when that's what made the answer valid. */
  formId?: number;
}

export interface DailySession {
  schemaVersion: 1;
  challengeId: string;
  date: string;
  answers: AnswerRecord[];
  completed: boolean;
  /** Wall-clock start of the current prompt's timer (epoch ms). */
  timer?: { index: number; startedAt: number };
}

export function outcomeOf(a: AnswerRecord): AnswerOutcome {
  return a.outcome ?? (a.correct ? "correct" : "incorrect");
}

export function newSession(challenge: DailyChallenge): DailySession {
  return { schemaVersion: 1, challengeId: challenge.id, date: challenge.date, answers: [], completed: false };
}

/**
 * Loads the saved attempt for this challenge. An unfinished save made against
 * different questions (data/config changed mid-day) is discarded; a finished
 * one is always kept, so a completed day can never be replayed.
 */
export function loadOrCreateSession(store: GameStore, challenge: DailyChallenge): DailySession {
  const saved = store.loadSession(challenge.date);
  if (saved && (saved.challengeId === challenge.id || saved.completed)) return saved;
  return newSession(challenge);
}

export function usedSpeciesIds(session: DailySession): number[] {
  return session.answers.flatMap((a) => (a.speciesId == null ? [] : [a.speciesId]));
}

/* ---------------- Timer ---------------- */

/** Starts the current prompt's timer. Idempotent: an already-running timer keeps its start time. */
export function startTimer(session: DailySession, now: number): DailySession {
  if (session.completed) return session;
  const index = session.answers.length;
  if (session.timer?.index === index) return session;
  return { ...session, timer: { index, startedAt: now } };
}

export function isTimerRunning(session: DailySession): boolean {
  return !session.completed && session.timer?.index === session.answers.length;
}

/** Time left on the current prompt; the full limit if its timer hasn't started. */
export function timeLeft(session: DailySession, now: number, limitMs = QUESTION_TIME_LIMIT_MS): number {
  if (!isTimerRunning(session)) return limitMs;
  return remainingMs(session.timer!.startedAt, now, limitMs);
}

/** Records a 0-point timeout if the current prompt's time is up; otherwise unchanged. */
export function applyTimeout(session: DailySession, challenge: DailyChallenge, now: number, limitMs = QUESTION_TIME_LIMIT_MS): DailySession {
  if (!isTimerRunning(session) || !isExpired(session.timer!.startedAt, now, limitMs)) return session;
  const question = challenge.questions[session.answers.length];
  if (!question) return session;
  const record: AnswerRecord = { questionId: question.id, speciesId: null, correct: false, outcome: "timeout", tier: null, points: 0, share: 0 };
  const answers = [...session.answers, record];
  return { ...session, answers, completed: answers.length >= challenge.questions.length };
}

/* ---------------- Answers ---------------- */

/**
 * Applies a turn-consuming result (correct / incorrect real Pokémon). Unknown
 * names and duplicates are ignored, and so is anything after time ran out.
 */
export function applyAnswer(
  session: DailySession,
  challenge: DailyChallenge,
  result: ValidationResult,
  now: number = Date.now(),
  limitMs = QUESTION_TIME_LIMIT_MS,
): DailySession {
  if (session.completed) return session;
  if (result.kind !== "correct" && result.kind !== "incorrect") return session;
  if (isTimerRunning(session) && isExpired(session.timer!.startedAt, now, limitMs)) return session;
  const question = challenge.questions[session.answers.length];
  if (!question) return session;
  if (session.answers.some((a) => a.speciesId === result.species.id)) return session;

  const record: AnswerRecord = {
    questionId: question.id,
    speciesId: result.species.id,
    correct: result.kind === "correct",
    outcome: result.kind,
    tier: result.score.tier,
    points: result.score.points,
    share: result.score.share,
    ...(result.kind === "correct" && result.formId ? { formId: result.formId } : {}),
  };
  const answers = [...session.answers, record];
  return { ...session, answers, completed: answers.length >= challenge.questions.length };
}

export function totalScore(session: DailySession): number {
  return session.answers.reduce((s, a) => s + a.points, 0);
}

/** The correct answer with the lowest share. */
export function rarestAnswer(session: DailySession): AnswerRecord | null {
  return session.answers.filter((a) => a.correct).sort((a, b) => a.share - b.share)[0] ?? null;
}

/** Highest-scoring answer (ties → rarer wins). */
export function bestAnswer(session: DailySession): AnswerRecord | null {
  return session.answers.filter((a) => a.correct).sort((a, b) => b.points - a.points || a.share - b.share)[0] ?? null;
}

export const MAX_SCORE_PER_QUESTION = Math.max(...TIERS.map((t) => t.points));

/**
 * Persists the session and, when it just became complete, records the day in
 * player progress (idempotent: safe to call again after a reload).
 */
export function persistSession(store: GameStore, session: DailySession): PlayerProgress {
  store.saveSession(session);
  let progress = store.loadProgress();
  if (session.completed && !progress.history[session.date]) {
    progress = recordCompletion(progress, {
      date: session.date,
      score: totalScore(session),
      tiers: session.answers.map((a) => a.tier),
      completedAt: new Date().toISOString(),
    });
    store.saveProgress(progress);
  }
  return progress;
}
