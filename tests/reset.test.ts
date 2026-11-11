import { describe, expect, it } from "vitest";
import { challengeNumber, dateKeyFor, formatDateLabel, msUntilReset, nextResetAt } from "@/lib/dates";
import { generateDailyChallenge } from "@/lib/questions";
import { activeStreak, emptyProgress, recordCompletion } from "@/lib/progress/streak";

/**
 * One instant, many local clocks: every player must land on the same
 * challenge date, number and id, whatever their timezone.
 */
describe("global reset consistency across timezones", () => {
  const instants = [
    "2026-11-06T23:30:00-08:00", // Los Angeles evening (already Nov 7 UTC)
    "2026-11-07T07:30:00Z", // UTC
    "2026-11-07T16:30:00+09:00", // Tokyo afternoon
    "2026-11-07T09:30:00+02:00", // Johannesburg
    "2026-11-07T21:00:00+13:45", // Chatham Islands (UTC+13:45)
  ];

  it("maps the same moment to the same date / number / challenge id everywhere", () => {
    const keys = instants.map((i) => dateKeyFor(new Date(i)));
    expect(new Set(keys)).toEqual(new Set(["2026-11-07"]));
    const ids = keys.map((k) => generateDailyChallenge(k).id);
    expect(new Set(ids).size).toBe(1);
    expect(challengeNumber("2026-11-07")).toBe(311);
  });

  it("labels the date in UTC regardless of the host timezone", () => {
    expect(formatDateLabel("2026-11-07")).toBe("NOV 7");
    expect(formatDateLabel("2027-01-01")).toBe("JAN 1");
  });

  it("counts down to the same instant everywhere", () => {
    const resets = instants.map((i) => nextResetAt(new Date(i)).toISOString());
    expect(new Set(resets)).toEqual(new Set(["2026-11-08T00:00:00.000Z"]));
  });
});

describe("year boundaries", () => {
  it("rolls Dec 31 → Jan 1 at 00:00 UTC and keeps challenge numbers continuous", () => {
    expect(dateKeyFor(new Date("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31");
    expect(dateKeyFor(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01-01");
    expect(challengeNumber("2026-12-31")).toBe(365);
    expect(challengeNumber("2027-01-01")).toBe(366);
    expect(challengeNumber("2028-12-31")).toBe(365 + 365 + 366); // 2028 is a leap year
    expect(msUntilReset(new Date("2026-12-31T23:59:00Z"))).toBe(60_000);
  });

  it("generates distinct, valid challenges across the new year", () => {
    const a = generateDailyChallenge("2026-12-31");
    const b = generateDailyChallenge("2027-01-01");
    expect(a.id).not.toBe(b.id);
    expect(b.questions).toHaveLength(6);
  });

  it("continues a streak across New Year and across Feb 29", () => {
    let p = recordCompletion(emptyProgress(), { date: "2026-12-31", score: 1, tiers: [], completedAt: "" });
    p = recordCompletion(p, { date: "2027-01-01", score: 1, tiers: [], completedAt: "" });
    expect(p.currentStreak).toBe(2);
    expect(activeStreak(p, "2027-01-02")).toBe(2);
    let q = recordCompletion(emptyProgress(), { date: "2028-02-28", score: 1, tiers: [], completedAt: "" });
    q = recordCompletion(q, { date: "2028-02-29", score: 1, tiers: [], completedAt: "" });
    q = recordCompletion(q, { date: "2028-03-01", score: 1, tiers: [], completedAt: "" });
    expect(q.currentStreak).toBe(3);
  });
});
