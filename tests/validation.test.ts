import { describe, expect, it } from "vitest";
import { CATEGORY_CONFIG, DIFFICULTY_BANDS } from "@/config/game";
import { ALL_SPECIES, findSpeciesByName, normalizeName } from "@/lib/pokedex";
import { QUESTION_POOL } from "@/lib/questions";
import { validateAnswer } from "@/lib/validation";

const q = (id: string) => {
  const found = QUESTION_POOL.find((x) => x.id === id);
  if (!found) throw new Error(`missing question ${id}`);
  return found;
};
const id = (name: string) => findSpeciesByName(name)!.id;

describe("name normalization", () => {
  it.each([
    ["Mr. Mime", "mr-mime"],
    ["mr mime", "mr-mime"],
    ["MR-MIME", "mr-mime"],
    ["Farfetch'd", "farfetchd"],
    ["Farfetch’d", "farfetchd"],
    ["Nidoran♀", "nidoran-f"],
    ["nidoran f", "nidoran-f"],
    ["Nidoran Female", "nidoran-f"],
    ["nidoran♂", "nidoran-m"],
    ["Flabébé", "flabebe"],
    ["flabebe", "flabebe"],
    ["Type: Null", "type-null"],
    ["type null", "type-null"],
    ["Ho-Oh", "ho-oh"],
    ["hooh", "ho-oh"],
    ["Porygon-Z", "porygon-z"],
    ["  pikachu  ", "pikachu"],
    ["Jangmo-o", "jangmo-o"],
    ["tapu koko", "tapu-koko"],
  ])("%s → %s", (input, slug) => {
    expect(findSpeciesByName(input)?.slug).toBe(slug);
  });

  it("rejects non-Pokémon", () => {
    expect(findSpeciesByName("Pikachoo")).toBeUndefined();
    expect(findSpeciesByName("")).toBeUndefined();
    expect(normalizeName("!!!")).toBe("");
  });
});

describe("validateAnswer", () => {
  const ghost = q("type:ghost");

  it("accepts a correct answer and scores it", () => {
    const r = validateAnswer("gengar", ghost, []);
    expect(r.kind).toBe("correct");
    if (r.kind === "correct") {
      expect(r.species.name).toBe("Gengar");
      expect(r.score.points).toBeGreaterThan(0);
      expect(r.score.tier).not.toBeNull();
    }
  });

  it("marks a real Pokémon that doesn't fit as incorrect with 0 points", () => {
    const r = validateAnswer("Pikachu", ghost, []);
    expect(r.kind).toBe("incorrect");
    if (r.kind === "incorrect") expect(r.score.points).toBe(0);
  });

  it("returns unknown for misspellings (no turn consumed)", () => {
    expect(validateAnswer("Gengr", ghost, []).kind).toBe("unknown");
    expect(validateAnswer("   ", ghost, []).kind).toBe("empty");
  });

  it("blocks reusing a species in the same challenge", () => {
    expect(validateAnswer("Gengar", ghost, [id("Gengar")]).kind).toBe("duplicate");
  });

  it("credits regional forms and reports the form id", () => {
    const r = validateAnswer("Typhlosion", ghost, []); // Hisuian Typhlosion is Fire/Ghost
    expect(r.kind).toBe("correct");
    if (r.kind === "correct") expect(r.formId).toBeGreaterThan(10000);
  });
});

describe("dataset accuracy (spot checks against known facts)", () => {
  it("covers all nine generations", () => {
    const gens = new Set(ALL_SPECIES.map((s) => s.gen));
    expect([...gens].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ALL_SPECIES.length).toBeGreaterThanOrEqual(1025);
  });

  it("knows typings", () => {
    const water = q("type:water").answers;
    const ground = q("type:ground").answers;
    for (const n of ["Swampert", "Quagsire", "Whiscash", "Gastrodon", "Seismitoad"]) {
      expect(water).toContain(id(n));
      expect(ground).toContain(id(n));
    }
    expect(ground).not.toContain(id("Squirtle"));
    expect(q("type:fairy").answers).toContain(id("Clefairy")); // current-gen typing
  });

  it("knows generations by debut (regional forms don't change it)", () => {
    expect(q("gen:3").answers).toContain(id("Rayquaza"));
    expect(q("gen:7").answers).not.toContain(id("Vulpix"));
    expect(q("gen:9").answers).toContain(id("Sprigatito"));
  });

  it("knows evolution methods (credited to the Pokémon that evolves)", () => {
    expect(q("evo:trade").answers).toContain(id("Haunter"));
    expect(q("evo:trade").answers).not.toContain(id("Gengar"));
    expect(q("evo:friendship").answers).toContain(id("Pichu"));
  });

  it("knows learnsets and abilities", () => {
    expect(q("move:thunderbolt").answers).toContain(id("Pikachu"));
    expect(q("move:tackle").answers).toContain(id("Bulbasaur"));
    expect(q("ability:levitate").answers).toContain(id("Gastly"));
  });
});

describe("question pool integrity", () => {
  it("every question has a verified, in-range answer set", () => {
    const ids = new Set(ALL_SPECIES.map((s) => s.id));
    for (const question of QUESTION_POOL) {
      const cfg = CATEGORY_CONFIG[question.category];
      expect(question.answers.length, question.id).toBeGreaterThanOrEqual(DIFFICULTY_BANDS.hard.minAnswers);
      expect(question.answers.length, question.id).toBeLessThanOrEqual(cfg.maxAnswers);
      expect(new Set(question.answers).size).toBe(question.answers.length);
      for (const a of question.answers) expect(ids.has(a)).toBe(true);
    }
  });

  it("has unique ids and readable prompts", () => {
    expect(new Set(QUESTION_POOL.map((x) => x.id)).size).toBe(QUESTION_POOL.length);
    for (const question of QUESTION_POOL) expect(question.prompt).toMatch(/^Name an? .+\.$/);
  });
});
