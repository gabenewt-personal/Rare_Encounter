import { describe, expect, it } from "vitest";
import { QUESTIONS_PER_DAY } from "@/config/game";
import { activeStreak, emptyProgress, recordCompletion, trainerClassFor, type DayResult } from "@/lib/progress/streak";
import { MemoryStore } from "@/lib/progress/store";
import { applyAnswer, loadOrCreateSession, newSession, persistSession, totalScore, usedSpeciesIds } from "@/lib/session";
import { generateDailyChallenge } from "@/lib/questions";
import { validateAnswer } from "@/lib/validation";
import { getSpecies } from "@/lib/pokedex";

const day = (date: string, score = 100): DayResult => ({ date, score, tiers: [], completedAt: date + "T12:00:00Z" });

describe("streaks", () => {
  it("starts at 1 and grows on consecutive days", () => {
    let p = recordCompletion(emptyProgress(), day("2026-11-01"));
    expect(p.currentStreak).toBe(1);
    p = recordCompletion(p, day("2026-11-02"));
    p = recordCompletion(p, day("2026-11-03"));
    expect(p.currentStreak).toBe(3);
    expect(p.bestStreak).toBe(3);
  });

  it("resets to 1 after a missed day but keeps the best streak", () => {
    let p = recordCompletion(emptyProgress(), day("2026-11-01"));
    p = recordCompletion(p, day("2026-11-02"));
    p = recordCompletion(p, day("2026-11-04"));
    expect(p.currentStreak).toBe(1);
    expect(p.bestStreak).toBe(2);
  });

  it("is idempotent: recording the same day twice changes nothing", () => {
    const p1 = recordCompletion(emptyProgress(), day("2026-11-01"));
    const p2 = recordCompletion(p1, day("2026-11-01", 999));
    expect(p2).toBe(p1);
    expect(p2.totalCompleted).toBe(1);
  });

  it("shows an active streak today/tomorrow, and 0 once a day is missed", () => {
    const p = recordCompletion(recordCompletion(emptyProgress(), day("2026-11-01")), day("2026-11-02"));
    expect(activeStreak(p, "2026-11-02")).toBe(2);
    expect(activeStreak(p, "2026-11-03")).toBe(2); // not played yet today — still alive
    expect(activeStreak(p, "2026-11-04")).toBe(0);
    expect(activeStreak(emptyProgress(), "2026-11-04")).toBe(0);
  });

  it("back-filling an older date (dev mode) never inflates the streak", () => {
    let p = recordCompletion(emptyProgress(), day("2026-11-05"));
    p = recordCompletion(p, day("2026-11-01"));
    expect(p.currentStreak).toBe(1);
    expect(p.lastCompletedDate).toBe("2026-11-05");
    p = recordCompletion(p, day("2026-11-04"));
    expect(p.currentStreak).toBe(2);
  });
});

describe("trainer classes", () => {
  it.each([
    [0, "Rookie"],
    [1, "Youngster"],
    [2, "Youngster"],
    [3, "Bug Catcher"],
    [7, "Camper"],
    [14, "Ace Trainer"],
    [30, "Veteran"],
    [60, "Gym Leader"],
    [100, "Elite Four"],
    [364, "Elite Four"],
    [365, "Champion"],
  ])("streak %i → %s", (streak, name) => {
    expect(trainerClassFor(streak).name).toBe(name);
  });

  it("reports progress toward the next class", () => {
    const t = trainerClassFor(5);
    expect(t.next?.name).toBe("Camper");
    expect(t.daysToNext).toBe(2);
    expect(t.progress).toBeCloseTo(5 / 7);
    expect(trainerClassFor(400).next).toBeNull();
  });
});

describe("daily session persistence", () => {
  const challenge = generateDailyChallenge("2026-11-06");
  const firstValid = (i: number, used: number[]) =>
    getSpecies(challenge.questions[i].answers.find((a) => !used.includes(a))!)!.name;

  function playAll(store: MemoryStore) {
    let s = loadOrCreateSession(store, challenge);
    while (!s.completed) {
      const used = usedSpeciesIds(s);
      const r = validateAnswer(firstValid(s.answers.length, used), challenge.questions[s.answers.length], used);
      s = applyAnswer(s, challenge, r);
      persistSession(store, s);
    }
    return s;
  }

  it("completing all six prompts completes the day and starts a streak", () => {
    const store = new MemoryStore();
    const s = playAll(store);
    expect(s.answers).toHaveLength(QUESTIONS_PER_DAY);
    expect(totalScore(s)).toBeGreaterThan(0);
    expect(store.loadProgress().currentStreak).toBe(1);
  });

  it("a completed challenge can't be answered again, even after reload", () => {
    const store = new MemoryStore();
    playAll(store);
    const reloaded = loadOrCreateSession(store, challenge);
    expect(reloaded.completed).toBe(true);
    const extra = validateAnswer("Pikachu", challenge.questions[0], []);
    expect(applyAnswer(reloaded, challenge, extra)).toBe(reloaded);
    // Persisting again (e.g. a second tab) doesn't double count.
    persistSession(store, reloaded);
    expect(store.loadProgress().totalCompleted).toBe(1);
    expect(store.loadProgress().currentStreak).toBe(1);
  });

  it("completion counts even with zero points", () => {
    const store = new MemoryStore();
    let s = newSession(challenge);
    for (let i = 0; i < QUESTIONS_PER_DAY; i++) {
      const used = usedSpeciesIds(s);
      const wrong = [25, 1, 4, 7, 133, 150, 151, 94].map((n) => getSpecies(n)!).find(
        (sp) => !challenge.questions[i].answers.includes(sp.id) && !used.includes(sp.id),
      )!;
      s = applyAnswer(s, challenge, validateAnswer(wrong.name, challenge.questions[i], used));
    }
    persistSession(store, s);
    expect(totalScore(s)).toBe(0);
    expect(store.loadProgress().history["2026-11-06"]).toBeDefined();
  });

  it("ignores answers that don't consume a turn and saves from a different challenge", () => {
    const store = new MemoryStore();
    let s = newSession(challenge);
    s = applyAnswer(s, challenge, validateAnswer("notapokemon", challenge.questions[0], []));
    expect(s.answers).toHaveLength(0);
    store.saveSession({ ...s, challengeId: "v1:2026-11-06:stale", answers: [{ questionId: "x", speciesId: 1, correct: true, tier: "poke", points: 10, share: 0.5 }] });
    expect(loadOrCreateSession(store, challenge).answers).toHaveLength(0);
  });

  it("keeps a completed day locked even if the day's questions change later", () => {
    const store = new MemoryStore();
    const done = playAll(store);
    store.saveSession({ ...done, challengeId: "v1:2026-11-06:old-fingerprint" });
    expect(loadOrCreateSession(store, challenge).completed).toBe(true);
  });
});
