import { describe, expect, it } from "vitest";
import { CATEGORY_CONFIG, DAILY_LAYOUT, MAX_PER_CATEGORY, MIN_VALID_ANSWERS, NO_REPEAT_DAYS, QUESTIONS_PER_DAY } from "@/config/game";
import { difficultyOf, typeTags } from "@/lib/questionDeck";
import { getSpecies } from "@/lib/pokedex";
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

  it("follows the daily layout: 2 easy → 3 medium → 1 challenging (effective answer counts)", () => {
    expect(DAILY_LAYOUT).toEqual(["easy", "easy", "medium", "medium", "medium", "hard"]);
    expect(QUESTIONS_PER_DAY).toBe(6);
    for (const c of challenges) {
      expect(c.questions).toHaveLength(6);
      expect(new Set(c.questions.map((q) => q.id)).size).toBe(6);
      c.questions.forEach((q, i) => {
        expect(difficultyOf(q), `${c.date} ${q.id}`).toBe(DAILY_LAYOUT[i]);
        expect(q.answers.length).toBeGreaterThanOrEqual(MIN_VALID_ANSWERS);
      });
      const perCat = new Map<string, number>();
      for (const q of c.questions) perCat.set(q.category, (perCat.get(q.category) ?? 0) + 1);
      expect(Math.max(...perCat.values())).toBeLessThanOrEqual(MAX_PER_CATEGORY);
    }
  });

  it("never makes one type the subject of two prompts on the same day (team diversity)", () => {
    for (const c of challenges) {
      const tags = c.questions.flatMap((q) => typeTags(q));
      expect(new Set(tags).size, `${c.date}: ${tags.join(",")}`).toBe(tags.length);
    }
  });

  it(`keeps repeats ≥${NO_REPEAT_DAYS} days apart over two simulated years`, () => {
    const lastSeen = new Map<string, number>();
    for (let i = 0; i < 730; i++) {
      for (const q of generateDailyChallenge(addDays("2026-01-01", i)).questions) {
        const prev = lastSeen.get(q.id);
        if (prev !== undefined) expect(i - prev, q.id).toBeGreaterThanOrEqual(NO_REPEAT_DAYS);
        lastSeen.set(q.id, i);
      }
    }
  });

  it("uses every generation prompt and every hard evolution prompt within a year", () => {
    const used = new Set(challenges.flatMap((c) => c.questions.map((q) => q.id)));
    const deck = QUESTION_POOL.filter((x) => x.category === "generation" || (x.category === "evolution" && difficultyOf(x) === "hard"));
    for (const q of deck) expect(used.has(q.id), q.id).toBe(true);
  });

  it("draws answers from every generation over time (all gens stay eligible)", () => {
    const gens = new Set(challenges.flatMap((c) => c.questions.flatMap((q) => q.answers.map((id) => getSpecies(id)!.gen))));
    expect([...gens].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("supports custom config without disturbing the default sequence", () => {
    const before = generateDailyChallenge("2026-11-06").questions.map((q) => q.id);
    const custom = generateDailyChallenge("2026-11-06", {
      categoryConfig: { ...CATEGORY_CONFIG, move: { ...CATEGORY_CONFIG.move, weights: {} } },
    });
    expect(custom.questions.some((q) => q.category === "move")).toBe(false);
    expect(generateDailyChallenge("2026-11-06").questions.map((q) => q.id)).toEqual(before);
  });

  it("varies categories over time", () => {
    const cats = new Set(challenges.flatMap((c) => c.questions.map((q) => q.category)));
    // Every category rotates in — wildcards only once some are approved.
    const expected = Object.keys(CATEGORY_CONFIG).filter((c) => c !== "wildcard" || QUESTION_POOL.some((q) => q.category === "wildcard"));
    expect([...cats].sort()).toEqual(expected.sort());
  });
});
