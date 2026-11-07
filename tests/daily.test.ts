import { describe, expect, it } from "vitest";
import { CATEGORY_CONFIG, MAX_PER_CATEGORY, NO_REPEAT_DAYS, QUESTIONS_PER_DAY } from "@/config/game";
import { addDays, challengeNumber, dateKeyFor, daysBetween, isDateKey, msUntilReset } from "@/lib/dates";
import { QUESTION_POOL, generateDailyChallenge } from "@/lib/questions";

describe("daily reset (global, UTC)", () => {
  it("rolls over exactly at 00:00 UTC regardless of local time zone", () => {
    expect(dateKeyFor(new Date("2026-11-06T23:59:59.999Z"))).toBe("2026-11-06");
    expect(dateKeyFor(new Date("2026-11-07T00:00:00.000Z"))).toBe("2026-11-07");
    // 7pm in New York on Nov 6 is already Nov 7 UTC.
    expect(dateKeyFor(new Date("2026-11-06T19:00:00-05:00"))).toBe("2026-11-07");
  });

  it("counts down to the next reset", () => {
    expect(msUntilReset(new Date("2026-11-06T23:00:00Z"))).toBe(3_600_000);
    expect(msUntilReset(new Date("2026-11-07T00:00:00Z"))).toBe(86_400_000);
  });

  it("does date math across month/year/DST boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(challengeNumber("2026-01-01")).toBe(1);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-02-28")).toBe(true);
  });
});

describe("generateDailyChallenge", () => {
  const days = Array.from({ length: 365 }, (_, i) => addDays("2026-11-01", i));
  const challenges = days.map((d) => generateDailyChallenge(d));

  it("is deterministic: same date ⇒ same prompts for everyone", () => {
    const a = generateDailyChallenge("2026-11-06");
    const b = generateDailyChallenge("2026-11-06");
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
    expect(a.id).toBe(b.id);
  });

  it("changes on the next date", () => {
    const a = generateDailyChallenge("2026-11-06").questions.map((q) => q.id);
    const b = generateDailyChallenge("2026-11-07").questions.map((q) => q.id);
    expect(a).not.toEqual(b);
  });

  it("gives five distinct prompts, ≤2 per category, ordered easy → hard", () => {
    for (const c of challenges) {
      expect(c.questions).toHaveLength(QUESTIONS_PER_DAY);
      expect(new Set(c.questions.map((q) => q.id)).size).toBe(QUESTIONS_PER_DAY);
      const perCat = new Map<string, number>();
      for (const q of c.questions) perCat.set(q.category, (perCat.get(q.category) ?? 0) + 1);
      expect(Math.max(...perCat.values())).toBeLessThanOrEqual(MAX_PER_CATEGORY);
      const counts = c.questions.map((q) => q.answers.length);
      expect([...counts].sort((a, b) => b - a)).toEqual(counts);
      for (const q of c.questions) expect(q.answers.length).toBeGreaterThanOrEqual(CATEGORY_CONFIG[q.category].minAnswers);
    }
  });

  it(`keeps repeats ≥${NO_REPEAT_DAYS} days apart (≥10 for tiny pools) over two simulated years`, () => {
    const poolSize = new Map<string, number>();
    for (const q of QUESTION_POOL) poolSize.set(q.category, (poolSize.get(q.category) ?? 0) + 1);
    const lastSeen = new Map<string, number>();
    for (let i = 0; i < 730; i++) {
      for (const q of generateDailyChallenge(addDays("2026-01-01", i)).questions) {
        const prev = lastSeen.get(q.id);
        const floor = poolSize.get(q.category)! >= 15 ? NO_REPEAT_DAYS : 10;
        if (prev !== undefined) expect(i - prev, q.id).toBeGreaterThanOrEqual(floor);
        lastSeen.set(q.id, i);
      }
    }
  });

  it("cycles through a whole category pool before it runs dry", () => {
    const used = new Set(challenges.flatMap((c) => c.questions.map((q) => q.id)));
    for (const q of QUESTION_POOL.filter((x) => x.category === "generation" || x.category === "evolution")) {
      expect(used.has(q.id), q.id).toBe(true);
    }
  });

  it("supports custom pools/config without disturbing the default sequence", () => {
    const before = generateDailyChallenge("2026-11-06").questions.map((q) => q.id);
    const custom = generateDailyChallenge("2026-11-06", { categoryConfig: { ...CATEGORY_CONFIG, move: { ...CATEGORY_CONFIG.move, weight: 0 } } });
    expect(custom.questions.some((q) => q.category === "move")).toBe(false);
    expect(generateDailyChallenge("2026-11-06").questions.map((q) => q.id)).toEqual(before);
  });

  it("varies categories over time", () => {
    const cats = new Set(challenges.flatMap((c) => c.questions.map((q) => q.category)));
    expect(cats.size).toBe(Object.values(CATEGORY_CONFIG).filter((c) => c.weight > 0).length);
  });
});
