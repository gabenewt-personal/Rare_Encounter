import { describe, expect, it } from "vitest";
import { QUESTION_TIME_LIMIT_SECONDS } from "@/config/game";
import { generateDailyChallenge } from "@/lib/questions";
import { MemoryStore } from "@/lib/progress/store";
import {
  applyAnswer,
  applyTimeout,
  isTimerRunning,
  loadOrCreateSession,
  newSession,
  outcomeOf,
  persistSession,
  startTimer,
  timeLeft,
  totalScore,
} from "@/lib/session";
import { displaySeconds, isUrgent, QUESTION_TIME_LIMIT_MS, remainingMs } from "@/lib/timer";
import { validateAnswer } from "@/lib/validation";
import { getSpecies } from "@/lib/pokedex";

const challenge = generateDailyChallenge("2026-11-06");
const T0 = Date.parse("2026-11-06T12:00:00Z");
const valid = (i: number) => getSpecies(challenge.questions[i].answers[0])!.name;

describe("timer math", () => {
  it("defaults to 20 seconds and counts down from the wall clock", () => {
    expect(QUESTION_TIME_LIMIT_SECONDS).toBe(20);
    expect(remainingMs(T0, T0)).toBe(20_000);
    expect(remainingMs(T0, T0 + 7_250)).toBe(12_750);
    expect(remainingMs(T0, T0 + 25_000)).toBe(0);
    expect(remainingMs(T0, T0 - 5_000)).toBe(20_000); // clock skew never adds time
  });

  it("shows whole seconds and flags the final five as urgent", () => {
    expect(displaySeconds(20_000)).toBe(20);
    expect(displaySeconds(4_001)).toBe(5);
    expect(displaySeconds(0)).toBe(0);
    expect(isUrgent(5_000)).toBe(true);
    expect(isUrgent(5_001)).toBe(false);
    expect(isUrgent(0)).toBe(false);
  });
});

describe("question timer in a daily session", () => {
  it("doesn't run until started, then start is idempotent", () => {
    let s = newSession(challenge);
    expect(isTimerRunning(s)).toBe(false);
    expect(timeLeft(s, T0 + 99_000)).toBe(QUESTION_TIME_LIMIT_MS);
    s = startTimer(s, T0);
    expect(startTimer(s, T0 + 5_000)).toBe(s); // re-render / reload keeps original start
    expect(timeLeft(s, T0 + 5_000)).toBe(15_000);
  });

  it("survives a refresh: remaining time is recomputed from the saved start", () => {
    const store = new MemoryStore();
    persistSession(store, startTimer(newSession(challenge), T0));
    const reloaded = loadOrCreateSession(store, challenge);
    expect(timeLeft(reloaded, T0 + 12_000)).toBe(8_000);
  });

  it("keeps counting while backgrounded and times out on return", () => {
    const s = startTimer(newSession(challenge), T0);
    expect(applyTimeout(s, challenge, T0 + 19_999)).toBe(s);
    const out = applyTimeout(s, challenge, T0 + 60_000); // came back a minute later
    expect(out.answers).toHaveLength(1);
    expect(outcomeOf(out.answers[0])).toBe("timeout");
    expect(out.answers[0]).toMatchObject({ speciesId: null, points: 0, tier: null, correct: false });
    expect(isTimerRunning(out)).toBe(false); // next prompt's timer hasn't started
  });

  it("stops on a valid submission and never awards a speed bonus", () => {
    const s = startTimer(newSession(challenge), T0);
    const fast = applyAnswer(s, challenge, validateAnswer(valid(0), challenge.questions[0], []), T0 + 1_000);
    const slow = applyAnswer(s, challenge, validateAnswer(valid(0), challenge.questions[0], []), T0 + 19_000);
    expect(fast.answers[0].points).toBe(slow.answers[0].points);
    expect(isTimerRunning(fast)).toBe(false);
    expect(applyTimeout(fast, challenge, T0 + 999_000)).toBe(fast); // stopped timer can't time out
  });

  it("unknown names and duplicates don't consume the turn or reset the timer", () => {
    const s = startTimer(newSession(challenge), T0);
    const after = applyAnswer(s, challenge, validateAnswer("notapokemon", challenge.questions[0], []), T0 + 5_000);
    expect(after).toBe(s);
    expect(after.timer?.startedAt).toBe(T0);
    expect(timeLeft(after, T0 + 5_000)).toBe(15_000);
  });

  it("rejects an answer submitted after time expired", () => {
    const s = startTimer(newSession(challenge), T0);
    const late = applyAnswer(s, challenge, validateAnswer(valid(0), challenge.questions[0], []), T0 + 20_001);
    expect(late).toBe(s);
  });

  it("timeouts count toward completing the day (and the streak)", () => {
    const store = new MemoryStore();
    let s = newSession(challenge);
    let t = T0;
    for (let i = 0; i < challenge.questions.length; i++) {
      s = startTimer(s, t);
      t += 21_000;
      s = applyTimeout(s, challenge, t);
    }
    persistSession(store, s);
    expect(s.completed).toBe(true);
    expect(totalScore(s)).toBe(0);
    expect(store.loadProgress().currentStreak).toBe(1);
  });
});
