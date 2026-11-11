import { describe, expect, it } from "vitest";
import { TEAM_SYNERGY } from "@/config/game";
import type { PokemonType } from "@/data/types";
import { addDays } from "@/lib/dates";
import { answerTypes, findSpeciesByName, getSpecies } from "@/lib/pokedex";
import { generateDailyChallenge } from "@/lib/questions";
import { MemoryStore } from "@/lib/progress/store";
import { emptyProgress, recordCompletion } from "@/lib/progress/streak";
import { applyAnswer, loadOrCreateSession, newSession, persistSession, scoreSummary, startTimer, applyTimeout, type DailySession } from "@/lib/session";
import { buildShareText } from "@/lib/share";
import { analyzeTeam, applyMultiplier, defensiveMultiplier, isFullValidTeam, tierForExposure } from "@/lib/synergy";
import { bestTeamExposure } from "@/lib/teamSearch";
import { trainerClassFor } from "@/lib/progress/streak";
import { validateAnswer } from "@/lib/validation";

const t = (name: string) => getSpecies(findSpeciesByName(name)!.id)!.types;

describe("type chart (PokéAPI, current generation)", () => {
  it("handles dual types, 4× weaknesses, resistances and immunities", () => {
    expect(defensiveMultiplier("ground", t("Charizard"))).toBe(0); // Flying immunity
    expect(defensiveMultiplier("rock", t("Charizard"))).toBe(4);
    expect(defensiveMultiplier("ice", t("Dragonite"))).toBe(4);
    expect(defensiveMultiplier("electric", t("Gyarados"))).toBe(4);
    expect(defensiveMultiplier("water", t("Charizard"))).toBe(2);
    expect(defensiveMultiplier("fire", t("Blastoise"))).toBe(0.5);
    expect(defensiveMultiplier("normal", t("Gengar"))).toBe(0);
    expect(defensiveMultiplier("dragon", t("Clefable"))).toBe(0); // Fairy, modern chart
    expect(defensiveMultiplier("bug", t("Scizor"))).toBe(0.5); // Steel resists Bug; Bug is neutral on Bug
    expect(defensiveMultiplier("fire", t("Scizor"))).toBe(4);
  });

  it("uses the regional form's typing when that's the form that answered", () => {
    expect(answerTypes(157)).toEqual(["fire"]);
    expect(answerTypes(157, 10233).sort()).toEqual(["fire", "ghost"]);
  });
});

describe("exposure formula", () => {
  it("sums max(0, weak − covered − allowance) over all 18 attacking types", () => {
    const fire: PokemonType[] = ["fire"];
    const team = Array.from({ length: 6 }, () => fire);
    const a = analyzeTeam(team);
    // Water, Ground and Rock each hit all six; nobody resists → (6 − 0 − allowance) each.
    const per = 6 - TEAM_SYNERGY.overlapAllowance;
    expect(a.matchups.find((m) => m.attacker === "water")!.exposure).toBe(per);
    expect(a.exposure).toBe(3 * per);
    expect(a.tier.id).toBe("poor");
    expect(a.vulnerabilities.map((v) => v.attacker).slice(0, 3).sort()).toEqual(["ground", "rock", "water"]);
  });

  it("counts resistant/immune teammates as cover, not just unique weaknesses", () => {
    const covered: PokemonType[][] = [["fire"], ["fire"], ["fire"], ["water"], ["water"], ["dragon"]];
    const m = analyzeTeam(covered).matchups.find((x) => x.attacker === "water")!;
    expect(m.weakMembers).toBe(3);
    expect(m.resistMembers).toBe(3); // two Water + Dragon
    expect(m.exposure).toBe(0);
  });

  it("weights 4× weaknesses by quadWeaknessWeight", () => {
    const team: PokemonType[][] = [["dragon", "flying"], ["dragon", "flying"], ["normal"], ["normal"], ["normal"], ["normal"]];
    const ice = analyzeTeam(team).matchups.find((x) => x.attacker === "ice")!;
    expect(ice.quadMembers).toBe(2);
    expect(ice.weak).toBe(2 * TEAM_SYNERGY.quadWeaknessWeight);
  });

  it("a classic balanced party rates well", () => {
    const team = ["Charizard", "Blastoise", "Venusaur", "Pikachu", "Snorlax", "Gengar"].map(t);
    const a = analyzeTeam(team);
    expect(["excellent", "good"]).toContain(a.tier.id);
  });

  it("maps exposure totals to tiers at the configured boundaries", () => {
    const expected: [number, string][] = [];
    let lo = 0;
    for (const tier of TEAM_SYNERGY.tiers) {
      expected.push([lo, tier.id]);
      if (Number.isFinite(tier.maxExposure)) expected.push([tier.maxExposure, tier.id]);
      lo = tier.maxExposure + 1;
    }
    for (const [x, id] of expected) expect(tierForExposure(x).id, `exposure ${x}`).toBe(id);
    expect(tierForExposure(999).multiplier).toBe(1);
  });

  it("uses the four configured multipliers, best = 1.15×", () => {
    expect(TEAM_SYNERGY.tiers.map((x) => x.multiplier)).toEqual([1.15, 1.1, 1.05, 1.0]);
  });
});

describe("eligibility and scoring", () => {
  const challenge = generateDailyChallenge("2026-11-10");
  const T0 = Date.parse("2026-11-10T12:00:00Z");

  function play(pick: (i: number, used: number[]) => string | null): DailySession {
    let s = newSession(challenge);
    let now = T0;
    for (let i = 0; i < 6; i++) {
      s = startTimer(s, now);
      const used = s.answers.flatMap((a) => (a.speciesId == null ? [] : [a.speciesId]));
      const name = pick(i, used);
      if (name == null) {
        now += 21_000;
        s = applyTimeout(s, challenge, now);
      } else {
        s = applyAnswer(s, challenge, validateAnswer(name, challenge.questions[i], used), now + 1000);
        now += 2000;
      }
    }
    return s;
  }
  const valid = (i: number, used: number[]) => getSpecies(challenge.questions[i].answers.find((a) => !used.includes(a))!)!.name;

  it("requires six valid, distinct Pokémon", () => {
    expect(isFullValidTeam([1, 2, 3, 4, 5, 6])).toBe(true);
    expect(isFullValidTeam([1, 2, 3, 4, 5, 5])).toBe(false);
    expect(isFullValidTeam([1, 2, 3, 4, 5, null])).toBe(false);
    expect(isFullValidTeam([1, 2, 3, 4, 5])).toBe(false);
  });

  it("applies the multiplier to the base rarity score after six correct answers", () => {
    const s = play(valid);
    expect(s.completed).toBe(true);
    const sum = scoreSummary(s);
    expect(sum.synergy).not.toBeNull();
    expect(sum.team).toHaveLength(6);
    expect(sum.final).toBe(applyMultiplier(sum.base, sum.multiplier));
    expect(sum.final).toBeGreaterThanOrEqual(sum.base);
    // Rarity stays primary: the bonus is at most +15%.
    expect(sum.final).toBeLessThanOrEqual(Math.round(sum.base * 1.15));
  });

  it("keeps the base score when a prompt was missed or timed out", () => {
    const missed = play((i, used) => (i === 2 ? null : valid(i, used)));
    expect(scoreSummary(missed).synergy).toBeNull();
    expect(scoreSummary(missed).final).toBe(scoreSummary(missed).base);
    const wrong = play((i, used) => {
      if (i !== 4) return valid(i, used);
      return [25, 1, 4, 7, 133, 94].map((n) => getSpecies(n)!).find((sp) => !challenge.questions[4].answers.includes(sp.id) && !used.includes(sp.id))!.name;
    });
    expect(scoreSummary(wrong).multiplier).toBe(1);
  });

  it("records the final score plus its breakdown in history", () => {
    const store = new MemoryStore();
    const s = play(valid);
    persistSession(store, s);
    const day = store.loadProgress().history["2026-11-10"];
    const sum = scoreSummary(s);
    expect(day.score).toBe(sum.final);
    expect(day.baseScore).toBe(sum.base);
    expect(day.multiplier).toBe(sum.multiplier);
    expect(day.synergyTier).toBe(sum.synergy!.tier.id);
  });

  it("shares the team tier without spoiling answers", () => {
    const s = play(valid);
    const text = buildShareText(s, challenge.number, trainerClassFor(1));
    expect(text).toMatch(/Team (Excellent|Good|Fair|Poor) ×1\.\d\d/);
    for (const a of s.answers) expect(text).not.toContain(getSpecies(a.speciesId!)!.name);
  });
});

describe("legacy five-question saves", () => {
  it("keep their score, stay locked, and never gain a synergy bonus", () => {
    const store = new MemoryStore();
    const challenge = generateDailyChallenge("2026-11-05");
    const legacy: DailySession = {
      schemaVersion: 1,
      challengeId: "v2:2026-11-05:oldfingerprint",
      date: "2026-11-05",
      completed: true,
      answers: [25, 6, 9, 3, 94].map((id, i) => ({ questionId: `old:${i}`, speciesId: id, correct: true, tier: "poke", points: 10, share: 0.3 })),
    };
    store.saveSession(legacy);
    let p = recordCompletion(emptyProgress(), { date: "2026-11-05", score: 50, tiers: [], completedAt: "" });
    store.saveProgress(p);

    const loaded = loadOrCreateSession(store, challenge);
    expect(loaded.answers).toHaveLength(5);
    expect(loaded.completed).toBe(true);
    const sum = scoreSummary(loaded);
    expect(sum.synergy).toBeNull();
    expect(sum.final).toBe(50);
    // Re-persisting (e.g. on load) doesn't rewrite history or streaks.
    p = persistSession(store, loaded);
    expect(p.history["2026-11-05"].score).toBe(50);
    expect(p.totalCompleted).toBe(1);
    // A six-question day right after continues the streak.
    p = recordCompletion(p, { date: "2026-11-06", score: 300, baseScore: 270, multiplier: 1.1, tiers: [], completedAt: "" });
    expect(p.currentStreak).toBe(2);
  });
});

describe("daily prompts allow a good party", () => {
  it("every day's best achievable party is Good or better (120 days)", () => {
    const good = TEAM_SYNERGY.tiers.find((x) => x.id === "good")!.maxExposure;
    for (let i = 0; i < 120; i++) {
      const date = addDays("2026-11-10", i);
      expect(bestTeamExposure(generateDailyChallenge(date).questions), date).toBeLessThanOrEqual(good);
    }
  });
});
