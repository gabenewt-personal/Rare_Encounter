/**
 * Expanded trivia categories, built from locally cached PokéAPI data.
 *
 * Every prompt here gets a complete accepted-answer set at build time, a
 * `family` (no two prompts of one family on the same day) and, where game
 * versions or rules matter, a one-line `description` shown under the prompt.
 *
 * Consistent rules:
 *  - Species are the unit of answering. Typing-based checks accept a species
 *    if its standard form OR a regional form fits (same as type prompts).
 *  - Base stats, height and weight use each species' STANDARD form.
 *  - Megas, Gigantamax and battle-only forms never count.
 */
import type { PokemonType, Question } from "../src/data/types";

export type StatKey = "hp" | "attack" | "defense" | "special-attack" | "special-defense" | "speed";

export interface FormLike {
  id: number;
  types: PokemonType[];
  stats: Record<StatKey, number>;
  height: number; // dm
  weight: number; // hg
}
export interface SpeciesLike {
  id: number;
  slug: string;
  name: string;
  gen: number;
  legendary: boolean;
  mythical: boolean;
  baby: boolean;
  color: string;
  genderRate: number;
  eggGroups: string[];
}
export interface EncounterLike {
  area: string;
  methods: string[];
}
export interface EvoLinkLike {
  from: string;
  trigger: string;
  minLevel: number | null;
  heldItem: string | null;
  timeOfDay: string;
  knownMove: boolean;
  location: boolean;
}

export interface CandidateLike {
  id: string;
  answers: Map<number, number | null>;
}

export interface ExpandedCtx {
  species: SpeciesLike[];
  forms: Map<number, { form: FormLike; regional: boolean }[]>;
  encounters: Map<number, EncounterLike[]>;
  links: EvoLinkLike[];
  stageOf: Map<string, number>;
  hasChildren: Set<string>;
  hasParent: Set<string>;
  chart: Record<string, Record<string, number>>;
  types: PokemonType[];
  candidate: (c: Omit<Question, "answers" | "forms" | "strong" | "weak">) => CandidateLike;
  addMatch: (c: CandidateLike, speciesId: number, matches: (f: FormLike) => boolean) => void;
  /** Answer-count bounds a threshold prompt should land in, per difficulty (raw counts). */
  bandTargets: { id: string; min: number; max: number }[];
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/** Letters only, accents stripped, uppercase (Flabébé → FLABEBE, Mr. Mime → MRMIME). */
export function nameLetters(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * For threshold prompts: among candidate thresholds, pick one per difficulty
 * band whose answer count lands inside it (closest to the band's middle).
 */
function pickThresholds(
  values: number[],
  thresholds: number[],
  test: (v: number, t: number) => boolean,
  bands: ExpandedCtx["bandTargets"],
): { band: string; threshold: number; count: number }[] {
  const out: { band: string; threshold: number; count: number }[] = [];
  for (const b of bands) {
    const mid = Number.isFinite(b.max) ? (b.min + b.max) / 2 : b.min * 1.6;
    let best: { threshold: number; count: number } | null = null;
    for (const t of thresholds) {
      const n = values.filter((v) => test(v, t)).length;
      if (n < b.min || n > b.max) continue;
      if (!best || Math.abs(n - mid) < Math.abs(best.count - mid)) best = { threshold: t, count: n };
    }
    if (best && !out.some((o) => o.threshold === best!.threshold)) out.push({ band: b.id, ...best });
  }
  return out;
}

export function addExpandedCandidates(ctx: ExpandedCtx) {
  const { species, forms, candidate, addMatch } = ctx;
  const defaultForm = (id: number) => forms.get(id)!.find((f) => !f.regional)!.form;

  /* ---------------- Base stats (standard form) ---------------- */
  const STATS: { key: StatKey | "total"; label: string }[] = [
    { key: "hp", label: "HP" },
    { key: "attack", label: "Attack" },
    { key: "defense", label: "Defense" },
    { key: "special-attack", label: "Sp. Atk" },
    { key: "special-defense", label: "Sp. Def" },
    { key: "speed", label: "Speed" },
    { key: "total", label: "stat total" },
  ];
  const statOf = (id: number, key: StatKey | "total") => {
    const st = defaultForm(id).stats;
    return key === "total" ? Object.values(st).reduce((a, b) => a + b, 0) : st[key];
  };
  const STAT_DESC = "Base stats of each species' standard form (regional and alternate forms don't count).";
  for (const { key, label } of STATS) {
    const values = species.map((s) => statOf(s.id, key));
    const steps = key === "total" ? [200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 680] : [20, 25, 30, 35, 40, 45, 50, 110, 120, 125, 130, 135, 140, 150, 160];
    const pretty = key === "total" ? "base stat total" : `base ${label}`;
    for (const { threshold } of pickThresholds(values, steps, (v, t) => v < t, ctx.bandTargets)) {
      const c = candidate({ id: `stat:${key}-below-${threshold}`, category: "stat", label: "BASE STATS", family: `stat:${key}`, description: STAT_DESC, prompt: `Name a Pokémon with a ${pretty} below ${threshold}.` });
      for (const s of species) if (statOf(s.id, key) < threshold) c.answers.set(s.id, null);
    }
    for (const { threshold } of pickThresholds(values, steps, (v, t) => v >= t, ctx.bandTargets)) {
      const c = candidate({ id: `stat:${key}-atleast-${threshold}`, category: "stat", label: "BASE STATS", family: `stat:${key}`, description: STAT_DESC, prompt: `Name a Pokémon with a ${pretty} of ${threshold} or more.` });
      for (const s of species) if (statOf(s.id, key) >= threshold) c.answers.set(s.id, null);
    }
  }
  // Comparison-based: a single highest stat (strictly — ties don't count).
  for (const { key, label } of STATS.filter((x) => x.key !== "total")) {
    const c = candidate({
      id: `stat:highest-${key}`,
      category: "stat",
      label: "BASE STATS",
      family: "stat:highest",
      description: `${STAT_DESC} Ties don't count.`,
      prompt: `Name a Pokémon whose single highest base stat is ${label}.`,
    });
    for (const s of species) {
      const st = defaultForm(s.id).stats;
      const v = st[key as StatKey];
      if (Object.entries(st).every(([k, x]) => k === key || x < v)) c.answers.set(s.id, null);
    }
  }
  {
    const c = candidate({ id: "stat:attack-equals-defense", category: "stat", label: "BASE STATS", family: "stat:compare", description: STAT_DESC, prompt: "Name a Pokémon whose base Attack and base Defense are exactly equal." });
    for (const s of species) {
      const st = defaultForm(s.id).stats;
      if (st.attack === st.defense) c.answers.set(s.id, null);
    }
    const d = candidate({ id: "stat:spatk-over-attack-by-50", category: "stat", label: "BASE STATS", family: "stat:compare", description: STAT_DESC, prompt: "Name a Pokémon whose base Sp. Atk is at least 50 higher than its base Attack." });
    for (const s of species) {
      const st = defaultForm(s.id).stats;
      if (st["special-attack"] - st.attack >= 50) d.answers.set(s.id, null);
    }
  }

  /* ---------------- Height / weight (standard form) ---------------- */
  const SIZE_DESC = "Official Pokédex height/weight of each species' standard form.";
  const heights = species.map((s) => defaultForm(s.id).height / 10);
  const weights = species.map((s) => defaultForm(s.id).weight / 10);
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
  for (const { threshold } of pickThresholds(heights, [0.2, 0.3, 0.4, 0.5], (v, t) => v <= t, ctx.bandTargets)) {
    const c = candidate({ id: `dex:height-max-${threshold}`, category: "pokedex", label: "POKéDEX", family: "pokedex:height", description: SIZE_DESC, prompt: `Name a Pokémon that is ${fmt(threshold)} m tall or shorter.` });
    for (const s of species) if (defaultForm(s.id).height / 10 <= threshold) c.answers.set(s.id, null);
  }
  for (const { threshold } of pickThresholds(heights, [1.8, 2, 2.5, 3, 3.5, 4, 5], (v, t) => v >= t, ctx.bandTargets)) {
    const c = candidate({ id: `dex:height-min-${threshold}`, category: "pokedex", label: "POKéDEX", family: "pokedex:height", description: SIZE_DESC, prompt: `Name a Pokémon that is at least ${fmt(threshold)} m tall.` });
    for (const s of species) if (defaultForm(s.id).height / 10 >= threshold) c.answers.set(s.id, null);
  }
  for (const { threshold } of pickThresholds(weights, [0.5, 1, 2, 3, 5], (v, t) => v <= t, ctx.bandTargets)) {
    const c = candidate({ id: `dex:weight-max-${threshold}`, category: "pokedex", label: "POKéDEX", family: "pokedex:weight", description: SIZE_DESC, prompt: `Name a Pokémon that weighs ${fmt(threshold)} kg or less.` });
    for (const s of species) if (defaultForm(s.id).weight / 10 <= threshold) c.answers.set(s.id, null);
  }
  for (const { threshold } of pickThresholds(weights, [150, 200, 250, 300, 400, 500], (v, t) => v >= t, ctx.bandTargets)) {
    const c = candidate({ id: `dex:weight-min-${threshold}`, category: "pokedex", label: "POKéDEX", family: "pokedex:weight", description: SIZE_DESC, prompt: `Name a Pokémon that weighs at least ${fmt(threshold)} kg.` });
    for (const s of species) if (defaultForm(s.id).weight / 10 >= threshold) c.answers.set(s.id, null);
  }

  /* ---------------- Other Pokédex attributes ---------------- */
  const COLOR_DESC = "The single official Pokédex color category — not every color visible on its body.";
  for (const color of [...new Set(species.map((s) => s.color))].filter(Boolean).sort()) {
    const c = candidate({ id: `dex:color-${color}`, category: "pokedex", label: "POKéDEX", family: "pokedex:color", description: COLOR_DESC, prompt: `Name a Pokémon whose official Pokédex color is ${cap(color)}.` });
    for (const s of species) if (s.color === color) c.answers.set(s.id, null);
  }
  const attr = (id: string, family: string, prompt: string, test: (s: SpeciesLike) => boolean, description?: string) => {
    const c = candidate({ id, category: "pokedex", label: "POKéDEX", family, prompt, ...(description ? { description } : {}) });
    for (const s of species) if (test(s)) c.answers.set(s.id, null);
  };
  attr("dex:genderless", "pokedex:gender", "Name a genderless Pokémon.", (s) => s.genderRate === -1, "Species with no male or female forms (gender unknown).");
  attr("dex:female-only", "pokedex:gender", "Name a Pokémon that is always female.", (s) => s.genderRate === 8);
  attr("dex:male-only", "pokedex:gender", "Name a Pokémon that is always male.", (s) => s.genderRate === 0);
  attr("dex:baby", "pokedex:baby", "Name a Baby Pokémon.", (s) => s.baby, "Officially classified Baby Pokémon (e.g. Pichu, Togepi).");
  attr("dex:legendary", "pokedex:legend", "Name a Legendary Pokémon.", (s) => s.legendary, "Officially Legendary species (Mythicals are a separate class).");
  attr("dex:mythical", "pokedex:legend", "Name a Mythical Pokémon.", (s) => s.mythical);
  const EGG_NAMES: Record<string, string> = {
    monster: "Monster", water1: "Water 1", water2: "Water 2", water3: "Water 3", bug: "Bug", flying: "Flying", ground: "Field",
    fairy: "Fairy", plant: "Grass", humanshape: "Human-Like", mineral: "Mineral", indeterminate: "Amorphous", dragon: "Dragon", ditto: "Ditto",
  };
  for (const [g, label] of Object.entries(EGG_NAMES)) {
    attr(`dex:egg-${g}`, "pokedex:egg", `Name a Pokémon in the ${label} Egg Group.`, (s) => s.eggGroups.includes(g), "Either of its Egg Groups counts.");
  }

  /* ---------------- Type matchups (by typing alone) ---------------- */
  const MATCH_DESC = "By typing alone, using the current type chart — abilities like Levitate don't count. Standard or regional form.";
  const mult = (atk: string, def: PokemonType[]) => def.reduce((m, d) => m * (ctx.chart[atk]?.[d] ?? 1), 1);
  for (const a of ctx.types) {
    const A = cap(a);
    const weak = candidate({ id: `matchup:weak-${a}`, category: "typeMatchup", label: "MATCHUP", family: `matchup`, description: MATCH_DESC, prompt: `Name a Pokémon that is weak to ${A}-type moves.` });
    const quad = candidate({ id: `matchup:quad-${a}`, category: "typeMatchup", label: "MATCHUP", family: `matchup`, description: MATCH_DESC, prompt: `Name a Pokémon that takes 4× damage from ${A}-type moves.` });
    const immune = candidate({ id: `matchup:immune-${a}`, category: "typeMatchup", label: "MATCHUP", family: `matchup`, description: MATCH_DESC, prompt: `Name a Pokémon that is immune to ${A}-type moves.` });
    const resist = candidate({ id: `matchup:resist-${a}`, category: "typeMatchup", label: "MATCHUP", family: `matchup`, description: `${MATCH_DESC} Immunities count as resisting.`, prompt: `Name a Pokémon that resists ${A}-type moves.` });
    for (const s of species) {
      addMatch(weak, s.id, (f) => mult(a, f.types) > 1);
      addMatch(quad, s.id, (f) => mult(a, f.types) >= 4);
      addMatch(immune, s.id, (f) => mult(a, f.types) === 0);
      addMatch(resist, s.id, (f) => mult(a, f.types) < 1);
    }
  }
  {
    const c = candidate({ id: "matchup:any-quad", category: "typeMatchup", label: "MATCHUP", family: "matchup", description: MATCH_DESC, prompt: "Name a Pokémon with at least one 4× weakness." });
    for (const s of species) addMatch(c, s.id, (f) => ctx.types.some((a) => mult(a, f.types) >= 4));
  }

  /* ---------------- Evolution ---------------- */
  const EVO = "EVOLUTION";
  const bySlug = new Map(species.map((s) => [s.slug, s]));
  const evoAttr = (id: string, prompt: string, test: (s: SpeciesLike) => boolean, description?: string) => {
    const c = candidate({ id, category: "evolution", label: EVO, family: "evo", prompt, ...(description ? { description } : {}) });
    for (const s of species) if (test(s)) c.answers.set(s.id, null);
  };
  evoAttr("evo:standalone", "Name a Pokémon that doesn't evolve.", (s) => !ctx.hasChildren.has(s.slug) && !ctx.hasParent.has(s.slug), "Neither evolves into nor from another species (Megas and Gigantamax don't count).");
  evoAttr("evo:stage-3", "Name a Pokémon that is the third stage of its evolution line.", (s) => (ctx.stageOf.get(s.slug) ?? 0) === 2, "e.g. Venusaur, Pidgeot — the second evolution of a line.");
  evoAttr("evo:middle", "Name a Pokémon in the middle of a three-stage evolution line.", (s) => (ctx.stageOf.get(s.slug) ?? 0) === 1 && ctx.hasChildren.has(s.slug), "Evolves from one species and into another (e.g. Ivysaur).");
  const linkAttr = (id: string, prompt: string, test: (l: EvoLinkLike) => boolean, description?: string) => {
    const c = candidate({ id, category: "evolution", label: EVO, family: "evo", prompt, ...(description ? { description } : {}) });
    for (const l of ctx.links) if (test(l) && bySlug.has(l.from)) c.answers.set(bySlug.get(l.from)!.id, null);
  };
  const levelUp = (l: EvoLinkLike) => l.trigger === "level-up";
  linkAttr("evo:time-of-day", "Name a Pokémon that evolves when leveled up at a particular time of day.", (l) => levelUp(l) && !!l.timeOfDay, "Credited to the Pokémon that evolves (e.g. Eevee → Umbreon at night).");
  linkAttr("evo:held-item", "Name a Pokémon that evolves by leveling up while holding an item.", (l) => levelUp(l) && !!l.heldItem, "Credited to the Pokémon that evolves (e.g. Gligar holding a Razor Fang).");
  linkAttr("evo:known-move", "Name a Pokémon that evolves by leveling up while knowing a certain move.", (l) => levelUp(l) && l.knownMove, "Credited to the Pokémon that evolves (e.g. Aipom knowing Double Hit).");
  const levels = ctx.links.filter((l) => levelUp(l) && l.minLevel != null);
  const lvSteps = [30, 32, 35, 36, 40, 42, 45, 50];
  const lvValues = [...new Map(levels.map((l) => [l.from, Math.min(...levels.filter((x) => x.from === l.from).map((x) => x.minLevel!))])).values()];
  for (const { threshold } of pickThresholds(lvValues, lvSteps, (v, t) => v >= t, ctx.bandTargets)) {
    linkAttr(`evo:level-${threshold}`, `Name a Pokémon that evolves by leveling up at level ${threshold} or higher.`, (l) => levelUp(l) && (l.minLevel ?? 0) >= threshold, "Credited to the Pokémon that evolves, using the level in current games.");
  }

  /* ---------------- Locations (PokéAPI encounter data) ---------------- */
  const WILD = (m: string) => !["gift", "gift-egg", "only-one", "npc-trade"].includes(m);
  const LOC_SCOPE = "Wild encounters in any main-series game PokéAPI has encounter data for (mostly Gen I–VII). Standard or regional form.";
  const FIRST_ROUTES = /^(kanto-route-1|unova-route-1|galar-route-1|alola-route-1|johto-route-29|hoenn-route-101|sinnoh-route-201|kalos-route-2)(-|$)/;
  const groups: { id: string; prompt: string; description: string; test: (e: EncounterLike) => boolean }[] = [
    { id: "first-route", prompt: "Name a Pokémon found in the wild on a region's first route.", description: `Kanto, Unova, Galar & Alola Route 1 · Johto Route 29 · Hoenn Route 101 · Sinnoh Route 201 · Kalos Route 2. ${LOC_SCOPE}`, test: (e) => FIRST_ROUTES.test(e.area) && e.methods.some(WILD) },
    { id: "forest", prompt: "Name a Pokémon found in the wild in a forest.", description: `Any area named Forest or Woods (e.g. Viridian Forest, Ilex Forest). ${LOC_SCOPE}`, test: (e) => /(forest|woods)/.test(e.area) && e.methods.some(WILD) },
    { id: "cave", prompt: "Name a Pokémon found in the wild in a cave.", description: `Caves, caverns, tunnels and grottos (e.g. Mt. Moon, Rock Tunnel, Granite Cave). ${LOC_SCOPE}`, test: (e) => /(cave|cavern|tunnel|grotto|mt-moon|seafloor|chargestone|meteor-falls|union-cave|dark-cave|iceberg|ice-path)/.test(e.area) && e.methods.some(WILD) },
    { id: "safari-zone", prompt: "Name a Pokémon found in a Safari Zone.", description: `Kanto, Johto, Hoenn and Kalos (Friend) Safari areas. ${LOC_SCOPE}`, test: (e) => /safari/.test(e.area) && e.methods.some(WILD) },
    { id: "victory-road", prompt: "Name a Pokémon found in the wild on Victory Road.", description: `Any region's Victory Road. ${LOC_SCOPE}`, test: (e) => /victory-road/.test(e.area) && e.methods.some(WILD) },
    { id: "surf", prompt: "Name a Pokémon you can encounter while Surfing.", description: `Wild encounters using the Surf method. ${LOC_SCOPE}`, test: (e) => e.methods.includes("surf") },
    { id: "fishing", prompt: "Name a Pokémon you can catch by fishing.", description: `Old, Good or Super Rod encounters. ${LOC_SCOPE}`, test: (e) => e.methods.some((m) => /rod/.test(m)) },
    { id: "headbutt", prompt: "Name a Pokémon that can fall out of a tree you Headbutt.", description: `Wild encounters using Headbutt (Gen II & IV games). ${LOC_SCOPE}`, test: (e) => e.methods.some((m) => /headbutt/.test(m)) },
    { id: "rock-smash", prompt: "Name a Pokémon you can find using Rock Smash.", description: `Wild encounters from smashed rocks. ${LOC_SCOPE}`, test: (e) => e.methods.includes("rock-smash") },
  ];
  for (const g of groups) {
    const c = candidate({ id: `location:${g.id}`, category: "location", label: "LOCATION", family: "location", description: g.description, prompt: g.prompt });
    for (const s of species) {
      const encs = ctx.encounters.get(s.id) ?? [];
      if (encs.some(g.test)) c.answers.set(s.id, null);
    }
  }

  /* ---------------- Name & Pokédex-number patterns ---------------- */
  const NAME_DESC = "Official English name, letters only — spaces, punctuation and symbols ignored; é counts as e.";
  const nameAttr = (id: string, family: string, prompt: string, test: (letters: string, s: SpeciesLike) => boolean, description = NAME_DESC) => {
    const c = candidate({ id, category: "namePattern", label: "NAME", family, prompt, description });
    for (const s of species) if (test(nameLetters(s.name), s)) c.answers.set(s.id, null);
  };
  for (const L of ["Z", "X", "Q", "J", "K", "V", "W", "Y"]) {
    nameAttr(`name:contains-${L.toLowerCase()}`, "name", `Name a Pokémon whose name contains the letter ${L}.`, (n) => n.includes(L));
  }
  nameAttr("name:double-letter", "name", "Name a Pokémon with a double letter in its name, like the EE in Eevee.", (n) => /([A-Z])\1/.test(n));
  nameAttr("name:same-start-end", "name", "Name a Pokémon whose name starts and ends with the same letter.", (n) => n.length > 1 && n[0] === n[n.length - 1]);
  for (const len of [4, 5]) nameAttr(`name:length-${len}`, "name", `Name a Pokémon whose name has exactly ${len} letters.`, (n) => n.length === len);
  nameAttr("name:length-10plus", "name", "Name a Pokémon whose name has 10 or more letters.", (n) => n.length >= 10);
  for (const L of ["A", "O", "X", "S"]) {
    nameAttr(`name:ends-${L.toLowerCase()}`, "name", `Name a Pokémon whose name ends with the letter ${L}.`, (n) => n.endsWith(L));
  }
  const DEX_DESC = "National Pokédex number.";
  for (const m of [25, 50]) {
    nameAttr(`dex:multiple-${m}`, "dex-number", `Name a Pokémon whose National Pokédex number is a multiple of ${m}.`, (_n, s) => s.id % m === 0, DEX_DESC);
  }
  nameAttr("dex:ends-7", "dex-number", "Name a Pokémon whose National Pokédex number ends in 7.", (_n, s) => s.id % 10 === 7, DEX_DESC);
}
