import { describe, expect, it } from "vitest";
import { CATEGORY_CONFIG, DAILY_VARIETY, MIN_VALID_ANSWERS, WEEKLY_GROUP_QUOTA } from "@/config/game";
import type { Question } from "@/data/types";
import { addDays } from "@/lib/dates";
import { ALL_SPECIES, findSpeciesByName, searchSpecies } from "@/lib/pokedex";
import { GENERATED_QUESTIONS, QUESTION_POOL, generateDailyChallenge, planWeek } from "@/lib/questions";
import { difficultyOf, typeTags } from "@/lib/questionDeck";
import { familyOf, generationTag } from "@/lib/questionTraits";
import { RESOLVED_WILDCARDS, WILDCARD_ENTRIES, resolveWildcard, wildcardQuestions } from "@/lib/wildcards";
import { nameLetters } from "../scripts/expanded-categories";

const q = (id: string) => {
  const found = GENERATED_QUESTIONS.find((x) => x.id === id);
  if (!found) throw new Error(`missing question ${id}`);
  return found;
};
const qs = (prefix: string) => GENERATED_QUESTIONS.filter((x) => x.id.startsWith(prefix));
const id = (name: string) => findSpeciesByName(name)!.id;
const has = (qq: Question, name: string) => qq.answers.includes(id(name));

describe("base stat prompts (standard form)", () => {
  it("generates below/at-least thresholds for every stat", () => {
    for (const s of ["hp", "attack", "defense", "special-attack", "special-defense", "speed", "total"]) {
      expect(qs(`stat:${s}-`).length, s).toBeGreaterThanOrEqual(2);
    }
  });

  it("checks values correctly", () => {
    for (const x of qs("stat:attack-below-")) expect(has(x, "Shuckle"), x.id).toBe(true); // Attack 10
    for (const x of qs("stat:defense-atleast-")) expect(has(x, "Shuckle"), x.id).toBe(true); // Defense 230
    for (const x of qs("stat:hp-atleast-")) expect(has(x, "Blissey"), x.id).toBe(true); // HP 255
    for (const x of qs("stat:speed-below-")) expect(has(x, "Ninjask"), x.id).toBe(false); // Speed 160
    expect(has(q("stat:highest-hp"), "Chansey")).toBe(true);
    expect(has(q("stat:highest-speed"), "Ninjask")).toBe(true);
    expect(has(q("stat:highest-speed"), "Snorlax")).toBe(false);
  });
});

describe("Pokédex attribute prompts", () => {
  it("height, weight, colour, gender, baby, legendary, egg groups", () => {
    for (const x of qs("dex:height-min-")) expect(has(x, "Wailord"), x.id).toBe(true); // 14.5 m
    for (const x of qs("dex:weight-max-")) expect(has(x, "Flabébé"), x.id).toBe(true); // 0.1 kg
    expect(has(q("dex:color-yellow"), "Pikachu")).toBe(true);
    expect(has(q("dex:color-red"), "Pikachu")).toBe(false);
    expect(q("dex:color-red").description).toMatch(/not every color/i); // distinguishes from visual prompts
    expect(has(q("dex:genderless"), "Magnemite")).toBe(true);
    expect(has(q("dex:genderless"), "Pikachu")).toBe(false);
    expect(has(q("dex:baby"), "Pichu")).toBe(true);
    expect(has(q("dex:legendary"), "Mewtwo")).toBe(true);
    expect(has(q("dex:legendary"), "Mew")).toBe(false);
    expect(has(q("dex:mythical"), "Mew")).toBe(true);
    expect(has(q("dex:egg-monster"), "Bulbasaur")).toBe(true);
  });
});

describe("type-matchup prompts (by typing alone)", () => {
  it("handles immunities, 4× weaknesses and resistances", () => {
    expect(has(q("matchup:immune-ground"), "Charizard")).toBe(true);
    expect(has(q("matchup:immune-ground"), "Pikachu")).toBe(false);
    expect(has(q("matchup:quad-ice"), "Dragonite")).toBe(true);
    expect(has(q("matchup:quad-fire"), "Scizor")).toBe(true);
    expect(has(q("matchup:resist-fire"), "Charmander")).toBe(true);
    expect(has(q("matchup:any-quad"), "Gyarados")).toBe(true);
    expect(q("matchup:weak-ice").description).toMatch(/abilities/i);
  });

  it("applies the regional-form rule (Alolan Sandshrew is Ice/Steel → 4× Fire)", () => {
    const quad = q("matchup:quad-fire");
    expect(has(quad, "Sandshrew")).toBe(true);
    expect(quad.forms?.[id("Sandshrew")]).toBeGreaterThan(10000);
  });

  it("treats immunity prompts as type prompts for daily variety", () => {
    expect(typeTags(q("matchup:immune-normal"))).toEqual(["ghost"]);
    expect(typeTags(q("matchup:immune-ground"))).toEqual(["flying"]);
  });
});

describe("evolution prompts", () => {
  it("covers standalone, stages and special methods", () => {
    expect(has(q("evo:standalone"), "Tauros")).toBe(true);
    expect(has(q("evo:standalone"), "Pikachu")).toBe(false);
    expect(has(q("evo:stage-3"), "Venusaur")).toBe(true);
    expect(has(q("evo:middle"), "Ivysaur")).toBe(true);
    expect(has(q("evo:middle"), "Venusaur")).toBe(false);
    expect(has(q("evo:time-of-day"), "Eevee")).toBe(true);
    expect(has(q("evo:known-move"), "Aipom")).toBe(true);
  });
});

describe("location prompts (PokéAPI encounters)", () => {
  it("knows classic encounters and documents scope", () => {
    expect(has(q("location:first-route"), "Pidgey")).toBe(true);
    expect(has(q("location:fishing"), "Magikarp")).toBe(true);
    expect(has(q("location:cave"), "Zubat")).toBe(true);
    expect(has(q("location:forest"), "Caterpie")).toBe(true);
    for (const x of qs("location:")) expect(x.description, x.id).toMatch(/PokéAPI/);
  });

  it("flags forced weaknesses (fishing answers are mostly Water types)", () => {
    expect(q("location:fishing").forcedWeak).toEqual(expect.arrayContaining(["electric", "grass"]));
  });
});

describe("name & number pattern prompts", () => {
  const rules: [string, (letters: string, dex: number) => boolean][] = [
    ["name:contains-z", (n) => n.includes("Z")],
    ["name:double-letter", (n) => /([A-Z])\1/.test(n)],
    ["name:same-start-end", (n) => n.length > 1 && n[0] === n[n.length - 1]],
    ["name:length-10plus", (n) => n.length >= 10],
    ["dex:multiple-25", (_n, d) => d % 25 === 0],
  ];
  it.each(rules)("%s matches exactly the species that satisfy it", (qid, rule) => {
    const expected = ALL_SPECIES.filter((s) => rule(nameLetters(s.name), s.id)).map((s) => s.id).sort((a, b) => a - b);
    expect(q(qid).answers).toEqual(expected);
  });

  it("normalizes letters (accents, spaces, symbols)", () => {
    expect(nameLetters("Flabébé")).toBe("FLABEBE");
    expect(nameLetters("Mr. Mime")).toBe("MRMIME");
    expect(nameLetters("Nidoran♀")).toBe("NIDORAN");
    expect(nameLetters("Type: Null")).toBe("TYPENULL");
  });
});

describe("pool rules", () => {
  it("never accepts prompts with fewer than 12 valid answers", () => {
    for (const x of QUESTION_POOL) expect(x.answers.length, x.id).toBeGreaterThanOrEqual(MIN_VALID_ANSWERS);
  });

  it("every prompt has a family and a known category/group", () => {
    for (const x of QUESTION_POOL) {
      expect(familyOf(x)).toBeTruthy();
      expect(CATEGORY_CONFIG[x.category], x.id).toBeDefined();
    }
  });

  it("every move/location prompt documents its scope", () => {
    for (const x of QUESTION_POOL.filter((y) => y.category === "move" || y.category === "location")) expect(x.description, x.id).toBeTruthy();
  });

  it("autocomplete reveals nothing before typing and never filters by correctness", () => {
    expect(searchSpecies("")).toEqual([]);
    expect(searchSpecies("   ")).toEqual([]);
    expect(searchSpecies("pika").map((s) => s.name)).toContain("Pikachu");
  });
});

describe("curated wildcards", () => {
  it("every entry resolves to real Pokémon with no duplicates and a unique id", () => {
    expect(new Set(WILDCARD_ENTRIES.map((e) => e.id)).size).toBe(WILDCARD_ENTRIES.length);
    for (const w of RESOLVED_WILDCARDS) {
      expect(w.unresolved, w.entry.id).toEqual([]);
      expect(w.duplicates, w.entry.id).toEqual([]);
      expect(["pending", "approved", "rejected"]).toContain(w.entry.status);
      expect(w.entry.description, w.entry.id).toBeTruthy();
    }
  });

  it("only approved wildcards with enough answers enter the rotation", () => {
    const base = WILDCARD_ENTRIES[0];
    expect(resolveWildcard({ ...base, status: "pending" }).eligible).toBe(false);
    expect(resolveWildcard({ ...base, status: "rejected" }).eligible).toBe(false);
    expect(resolveWildcard({ ...base, status: "approved" }).eligible).toBe(true);
    expect(resolveWildcard({ ...base, status: "approved", answers: base.answers.slice(0, 5) }).eligible).toBe(false);
    expect(resolveWildcard({ ...base, status: "approved", answers: [...base.answers, "Notamon"] }).eligible).toBe(false);
    const approvedIds = RESOLVED_WILDCARDS.filter((w) => w.eligible).map((w) => w.entry.id);
    expect(QUESTION_POOL.filter((x) => x.category === "wildcard").map((x) => x.id).sort()).toEqual(approvedIds.sort());
  });

  it("pending wildcards only appear in dev previews", () => {
    const pending = RESOLVED_WILDCARDS.filter((w) => w.entry.status === "pending").map((w) => w.entry.id);
    for (let i = 0; i < 28; i++) {
      for (const x of generateDailyChallenge(addDays("2026-11-10", i)).questions) expect(pending).not.toContain(x.id);
    }
    expect(wildcardQuestions({ includePending: true }).length).toBeGreaterThanOrEqual(pending.length);
  });

  it("visual wildcards tell players they're judged from artwork, not the Pokédex color", () => {
    for (const w of RESOLVED_WILDCARDS.filter((x) => x.entry.basis === "visual")) {
      expect(w.question.description).toMatch(/not the Pokédex color/i);
    }
  });
});

describe("rotation", () => {
  it("plans each week to the 24 / 12 / 6 group quota", () => {
    for (let w = 0; w < 20; w++) {
      const plan = planWeek("test", w);
      expect(plan).toHaveLength(7);
      const flat = plan.flat();
      expect(flat).toHaveLength(42);
      expect(flat.filter((g) => g === "core")).toHaveLength(WEEKLY_GROUP_QUOTA.core);
      expect(flat.filter((g) => g === "trivia")).toHaveLength(WEEKLY_GROUP_QUOTA.trivia);
      expect(flat.filter((g) => g === "wildcard")).toHaveLength(WEEKLY_GROUP_QUOTA.wildcard);
      for (const day of plan) expect(day.filter((g) => g === "wildcard").length).toBeLessThanOrEqual(1);
    }
  });

  it("hits the group mix when enough wildcards are approved", () => {
    // Simulate a healthy wildcard library: 16 approved curated prompts.
    const fakeWildcards: Question[] = GENERATED_QUESTIONS.filter((x) => x.category === "type" || x.category === "letter")
      .slice(0, 16)
      .map((x) => ({ ...x, id: `wild:test-${x.id}`, category: "wildcard", family: "wildcard", label: "WILDCARD" }));
    const pool = [...GENERATED_QUESTIONS, ...fakeWildcards];
    const counts: Record<string, number> = { core: 0, trivia: 0, wildcard: 0 };
    const DAYS = 56;
    for (let i = 0; i < DAYS; i++) {
      for (const x of generateDailyChallenge(addDays("2026-11-09", i), { pool }).questions) counts[CATEGORY_CONFIG[x.category].group]++;
    }
    const perWeek = (g: string) => counts[g] / (DAYS / 7);
    expect(perWeek("wildcard")).toBeGreaterThanOrEqual(5);
    expect(perWeek("core")).toBeGreaterThanOrEqual(22);
    expect(perWeek("core")).toBeLessThanOrEqual(27);
    expect(perWeek("trivia")).toBeGreaterThanOrEqual(10);
  });

  it("keeps core prompts near 55–60% of a week", () => {
    let core = 0;
    let total = 0;
    for (let i = 0; i < 70; i++) {
      for (const x of generateDailyChallenge(addDays("2026-11-10", i)).questions) {
        total++;
        if (CATEGORY_CONFIG[x.category].group === "core") core++;
      }
    }
    expect(core / total).toBeGreaterThanOrEqual(0.5);
    expect(core / total).toBeLessThanOrEqual(0.62);
  });

  it("enforces the daily variety rules", () => {
    for (let i = 0; i < 120; i++) {
      const c = generateDailyChallenge(addDays("2026-11-10", i));
      const fams = c.questions.map(familyOf);
      expect(new Set(fams).size, `${c.date}: ${fams}`).toBe(fams.length);
      expect(c.questions.filter((x) => generationTag(x) != null).length).toBeLessThanOrEqual(DAILY_VARIETY.maxGenerationPrompts);
      const weak = new Map<string, number>();
      for (const x of c.questions) for (const t of x.forcedWeak ?? []) weak.set(t, (weak.get(t) ?? 0) + 1);
      for (const [t, n] of weak) expect(n, `${c.date} ${t}`).toBeLessThanOrEqual(DAILY_VARIETY.maxForcedWeaknessPerType);
      c.questions.forEach((x) => expect(difficultyOf(x)).not.toBeNull());
    }
  });

  it("stays deterministic", () => {
    const a = generateDailyChallenge("2027-02-14").questions.map((x) => x.id);
    const b = generateDailyChallenge("2027-02-14").questions.map((x) => x.id);
    expect(a).toEqual(b);
  });
});
