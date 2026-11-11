/* eslint-disable @typescript-eslint/no-explicit-any -- raw PokéAPI JSON is trimmed into typed shapes below */
/**
 * Data preparation: fetch → validate → cache → build question pool.
 *
 *   npm run data            # uses the on-disk cache where possible
 *   npm run data -- --fresh # ignore cache and refetch everything
 *
 * Reads the public PokéAPI (https://pokeapi.co/api/v2/, no key needed) and
 * writes two committed, versioned files used by the game at runtime:
 *
 *   src/data/generated/pokedex.json    – every species (answer list / autocomplete)
 *   src/data/generated/questions.json  – every candidate prompt + verified answer set
 *
 * The game NEVER calls PokéAPI during play. Raw responses are trimmed and cached
 * in .cache/pokeapi/ (git-ignored) so re-runs are fast and polite to the API.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { CATEGORY_CONFIG, FORCED_WEAKNESS_SHARE, MIN_VALID_ANSWERS, PROMPT_FAMILIARITY, type QuestionCategory } from "../src/config/game";
import { addExpandedCandidates } from "./expanded-categories";
import type { PokemonType, Question, Species } from "../src/data/types";

const API = "https://pokeapi.co/api/v2";
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache", "pokeapi");
const OUT_DIR = path.join(ROOT, "src", "data", "generated");
const FRESH = process.argv.includes("--fresh");
const CONCURRENCY = 10;

const TYPES: PokemonType[] = [
  "normal", "fire", "water", "grass", "electric", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const REGIONAL = /-(alola|galar|hisui|paldea)(-(standard|combat-breed|blaze-breed|aqua-breed))?$/;

/* ------------------------------------------------------------------ */
/* Fetch + cache                                                       */
/* ------------------------------------------------------------------ */

let requests = 0;
let cacheHits = 0;

/** `version` invalidates cached files when the trimmed shape changes. */
async function cached<T>(endpoint: string, trim: (raw: any) => T, version = 1): Promise<T> {
  const suffix = version > 1 ? `@v${version}` : "";
  const file = path.join(CACHE_DIR, endpoint.replace(/[^a-z0-9-]+/gi, "_") + suffix + ".json");
  if (!FRESH && existsSync(file)) {
    cacheHits++;
    return JSON.parse(await readFile(file, "utf8")) as T;
  }
  const url = endpoint.startsWith("http") ? endpoint : `${API}/${endpoint}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      requests++;
      const res = await fetch(url, { headers: { "User-Agent": "rare-encounter-dataset-builder" } });
      if (res.status === 404) throw new Error(`404 ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const data = trim(await res.json());
      await writeFile(file, JSON.stringify(data));
      return data;
    } catch (err) {
      lastErr = err;
      if (String(err).includes("404")) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>, label: string): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      done++;
      if (done % 100 === 0 || done === items.length) {
        process.stdout.write(`\r  ${label}: ${done}/${items.length}   `);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write("\n");
  return out;
}

const en = (names: any[]): string | undefined =>
  names?.find((n: any) => n.language?.name === "en")?.name;
const idFromUrl = (url: string) => Number(url.split("/").filter(Boolean).pop());

/* ------------------------------------------------------------------ */
/* Trimmed shapes                                                      */
/* ------------------------------------------------------------------ */

interface RawSpecies {
  id: number; slug: string; name: string; gen: number;
  legendary: boolean; mythical: boolean; baby: boolean;
  chainUrl: string | null; evolvesFrom: string | null;
  varieties: { slug: string; isDefault: boolean }[];
  /** Official Pokédex colour (e.g. "yellow"). */
  color: string;
  /** Eighths female; -1 = genderless. */
  genderRate: number;
  eggGroups: string[];
}
const SPECIES_TRIM_VERSION = 2;
interface RawPokemon {
  id: number; slug: string; types: PokemonType[];
  abilities: { name: string; hidden: boolean }[];
  /** levelUp: learned by level-up in at least one game (vs. only TM/egg/tutor). */
  moves: { name: string; levelUp: boolean }[];
  stats: Record<StatKey, number>;
  /** Decimetres / hectograms, as PokéAPI reports them. */
  height: number;
  weight: number;
}
const POKEMON_TRIM_VERSION = 3;
type StatKey = "hp" | "attack" | "defense" | "special-attack" | "special-defense" | "speed";
interface EvoLink {
  from: string; to: string; trigger: string; item: string | null; happiness: boolean;
  minLevel: number | null; heldItem: string | null; timeOfDay: string; knownMove: boolean; location: boolean;
}
const CHAIN_TRIM_VERSION = 2;
interface RawChain { id: number; links: EvoLink[]; stages: Record<string, number> }

const trimSpecies = (s: any): RawSpecies => ({
  id: s.id,
  slug: s.name,
  name: en(s.names) ?? s.name,
  gen: idFromUrl(s.generation.url),
  legendary: s.is_legendary,
  mythical: s.is_mythical,
  baby: s.is_baby,
  chainUrl: s.evolution_chain?.url ?? null,
  evolvesFrom: s.evolves_from_species?.name ?? null,
  varieties: s.varieties.map((v: any) => ({ slug: v.pokemon.name, isDefault: v.is_default })),
  color: s.color?.name ?? "",
  genderRate: s.gender_rate,
  eggGroups: s.egg_groups.map((g: any) => g.name),
});

const trimPokemon = (p: any): RawPokemon => ({
  id: p.id,
  slug: p.name,
  types: p.types.sort((a: any, b: any) => a.slot - b.slot).map((t: any) => t.type.name),
  abilities: p.abilities.map((a: any) => ({ name: a.ability.name, hidden: a.is_hidden })),
  // Any learn method (level-up, TM/HM/TR, egg, tutor…) in any game PokéAPI records.
  moves: p.moves.map((m: any) => ({
    name: m.move.name,
    levelUp: m.version_group_details.some((d: any) => d.move_learn_method?.name === "level-up"),
  })),
  stats: Object.fromEntries(p.stats.map((x: any) => [x.stat.name, x.base_stat])) as Record<StatKey, number>,
  height: p.height,
  weight: p.weight,
});

function trimChain(c: any): RawChain {
  const links: EvoLink[] = [];
  const stages: Record<string, number> = {};
  const walk = (node: any, depth: number) => {
    stages[node.species.name] = depth;
    for (const child of node.evolves_to) {
      for (const d of child.evolution_details) {
        links.push({
          from: node.species.name,
          to: child.species.name,
          trigger: d.trigger?.name ?? "",
          item: d.item?.name ?? null,
          happiness: d.min_happiness != null,
          minLevel: d.min_level ?? null,
          heldItem: d.held_item?.name ?? null,
          timeOfDay: d.time_of_day ?? "",
          knownMove: d.known_move != null || d.known_move_type != null,
          location: d.location != null,
        });
      }
      walk(child, depth + 1);
    }
  };
  walk(c.chain, 0);
  return { id: c.id, links, stages };
}

const trimNamed = (x: any) => ({ slug: x.name, name: en(x.names) ?? x.name });
const trimMove = (x: any) => ({ ...trimNamed(x), type: x.type?.name as PokemonType, gen: idFromUrl(x.generation.url) });
const trimAbility = (x: any) => ({ ...trimNamed(x), gen: idFromUrl(x.generation.url) });

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Building dataset from ${API}${FRESH ? " (fresh)" : ""}`);

  // 1. Species list + species details.
  const list = await cached("pokemon-species?limit=5000", (r) =>
    r.results.map((x: any) => x.name as string),
  );
  const species = await mapLimit(list, (slug) => cached(`pokemon-species/${slug}`, trimSpecies, SPECIES_TRIM_VERSION), "species");
  species.sort((a, b) => a.id - b.id);

  // 2. Default form + regional variants (Alolan, Galarian, Hisuian, Paldean).
  const formSlugs: { speciesId: number; slug: string; regional: boolean }[] = [];
  for (const s of species) {
    for (const v of s.varieties) {
      if (v.isDefault) formSlugs.push({ speciesId: s.id, slug: v.slug, regional: false });
      else if (REGIONAL.test(v.slug)) formSlugs.push({ speciesId: s.id, slug: v.slug, regional: true });
    }
  }
  const forms = await mapLimit(formSlugs, (f) => cached(`pokemon/${f.slug}`, trimPokemon, POKEMON_TRIM_VERSION), "forms");
  // Wild encounter data (location areas + methods), default and regional forms.
  const encounterLists = await mapLimit(
    formSlugs,
    (f) =>
      cached(`pokemon/${f.slug}/encounters`, (list: any[]) =>
        list.map((e) => ({
          area: e.location_area.name as string,
          methods: [...new Set(e.version_details.flatMap((v: any) => v.encounter_details.map((d: any) => d.method.name as string)))] as string[],
        })),
      ),
    "encounters",
  );
  const encountersBySpecies = new Map<number, { area: string; methods: string[] }[]>();
  formSlugs.forEach((f, i) => {
    encountersBySpecies.set(f.speciesId, [...(encountersBySpecies.get(f.speciesId) ?? []), ...encounterLists[i]]);
  });

  const formsBySpecies = new Map<number, { form: RawPokemon; regional: boolean }[]>();
  formSlugs.forEach((f, i) => {
    const arr = formsBySpecies.get(f.speciesId) ?? [];
    arr.push({ form: forms[i], regional: f.regional });
    formsBySpecies.set(f.speciesId, arr);
  });

  // 3. Evolution chains.
  const chainUrls = [...new Set(species.map((s) => s.chainUrl).filter(Boolean) as string[])];
  const chains = await mapLimit(chainUrls, (u) => cached(`evolution-chain/${idFromUrl(u)}`, trimChain, CHAIN_TRIM_VERSION), "chains");
  const stageOf = new Map<string, number>();
  const chainOf = new Map<string, number>();
  const hasChildren = new Set<string>();
  const hasParent = new Set<string>();
  const allLinks: EvoLink[] = [];
  for (const c of chains) {
    for (const [slug, st] of Object.entries(c.stages)) {
      stageOf.set(slug, st);
      chainOf.set(slug, c.id);
    }
    for (const l of c.links) {
      hasChildren.add(l.from);
      hasParent.add(l.to);
      allLinks.push(l);
    }
  }

  // ---- Validate core data before going further ----
  const errors: string[] = [];
  const bySlug = new Map(species.map((s) => [s.slug, s]));
  for (const s of species) {
    const fs = formsBySpecies.get(s.id);
    if (!fs?.some((f) => !f.regional)) errors.push(`${s.slug}: missing default form`);
    for (const f of fs ?? []) {
      if (!f.form.types.length || f.form.types.some((t) => !TYPES.includes(t))) errors.push(`${f.form.slug}: bad types`);
    }
    if (!(s.gen >= 1 && s.gen <= 9)) errors.push(`${s.slug}: bad generation ${s.gen}`);
    if (!s.name) errors.push(`${s.slug}: missing English name`);
  }
  if (species.length < 1000) errors.push(`only ${species.length} species found`);
  if (new Set(species.map((s) => s.id)).size !== species.length) errors.push("duplicate species ids");
  if (errors.length) {
    console.error("Validation failed:\n  " + errors.slice(0, 30).join("\n  "));
    process.exit(1);
  }

  // 4. Pokédex output.
  const pokedex: Species[] = species.map((s) => {
    const def = formsBySpecies.get(s.id)!.find((f) => !f.regional)!.form;
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      gen: s.gen,
      types: def.types,
      legendary: s.legendary,
      mythical: s.mythical,
      baby: s.baby,
      stage: stageOf.get(s.slug) ?? 0,
      isFinal: !hasChildren.has(s.slug),
      chain: chainOf.get(s.slug) ?? 0,
    };
  });

  // 5. Build candidate questions.
  type Candidate = Omit<Question, "answers" | "forms" | "strong" | "weak"> & {
    answers: Map<number, number | null>;
    strong: Set<number>;
    weak: Set<number>;
  };
  const candidates: Candidate[] = [];
  const candidate = (c: Omit<Candidate, "answers" | "strong" | "weak">): Candidate => {
    const full = { ...c, answers: new Map(), strong: new Set<number>(), weak: new Set<number>() };
    candidates.push(full);
    return full;
  };
  type Relevance = "strong" | "weak" | null;
  /**
   * Adds a species if its default form (or failing that, a regional form) matches.
   * `relevance` classifies how naturally the answer fits THIS prompt — the
   * prompt-specific signal used by the estimated rarity model. Regional-only
   * matches are always "weak" (few players think of them).
   */
  const addMatch = (
    c: Candidate,
    speciesId: number,
    matches: (f: RawPokemon) => boolean,
    relevance: (f: RawPokemon) => Relevance = () => null,
  ) => {
    const fs = formsBySpecies.get(speciesId)!;
    const def = fs.find((f) => !f.regional)!;
    if (matches(def.form)) {
      c.answers.set(speciesId, null);
      const r = relevance(def.form);
      if (r === "strong") c.strong.add(speciesId);
      if (r === "weak") c.weak.add(speciesId);
    } else {
      const reg = fs.find((f) => f.regional && matches(f.form));
      if (reg && !c.answers.has(speciesId)) {
        c.answers.set(speciesId, reg.form.id);
        c.weak.add(speciesId);
      }
    }
  };
  /**
   * Primary-type members are the "obvious" answers to a type prompt. Flying is
   * the exception: it's conventionally listed second (Normal/Flying birds), so
   * any Flying type counts as a textbook answer.
   */
  const typeRelevance = (t: PokemonType) => (f: RawPokemon): Relevance =>
    f.types[0] === t || (t === "flying" && f.types.includes("flying")) ? "strong" : null;
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  const typeName = (t: string) => cap(t);
  const article = (w: string) => (/^[AEIOU]/i.test(w) ? "an" : "a");

  // Type.
  for (const t of TYPES) {
    const c = candidate({ id: `type:${t}`, category: "type", label: "TYPE", prompt: `Name ${article(t)} ${typeName(t)}-type Pokémon.` });
    for (const s of species) addMatch(c, s.id, (f) => f.types.includes(t), typeRelevance(t));
  }
  // Dual type (exact pair, order-insensitive).
  for (let i = 0; i < TYPES.length; i++) {
    for (let j = i + 1; j < TYPES.length; j++) {
      const a = TYPES[i], b = TYPES[j];
      const c = candidate({ id: `dual:${a}-${b}`, category: "dualType", label: "DUAL TYPE", prompt: `Name a Pokémon with both ${typeName(a)} and ${typeName(b)} typing.` });
      for (const s of species) addMatch(c, s.id, (f) => f.types.length === 2 && f.types.includes(a) && f.types.includes(b));
    }
  }
  // Generation.
  for (let g = 1; g <= 9; g++) {
    const c = candidate({ id: `gen:${g}`, category: "generation", label: "GENERATION", prompt: `Name a Pokémon introduced in Generation ${ROMAN[g]}.` });
    for (const s of species) if (s.gen === g) c.answers.set(s.id, null);
  }
  // Type + generation.
  for (const t of TYPES) {
    for (let g = 1; g <= 9; g++) {
      const c = candidate({ id: `typegen:${t}-${g}`, category: "typeGeneration", label: "TYPE + GEN", prompt: `Name ${article(t)} ${typeName(t)}-type Pokémon introduced in Generation ${ROMAN[g]}.` });
      for (const s of species) if (s.gen === g) addMatch(c, s.id, (f) => f.types.includes(t), typeRelevance(t));
    }
  }

  // First letter of the official English name (accents stripped, so Flabébé is under F).
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const c = candidate({ id: `letter:${letter.toLowerCase()}`, category: "letter", label: "NAME", prompt: `Name a Pokémon whose name starts with ${letter}.` });
    for (const s of species) {
      if (s.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().startsWith(letter)) c.answers.set(s.id, null);
    }
  }

  // Moves & abilities: count first, then only fetch details for usable ones.
  const moveLearners = new Map<string, Set<number>>();
  const abilityHolders = new Map<string, Set<number>>();
  for (const s of species) {
    for (const { form } of formsBySpecies.get(s.id)!) {
      for (const { name: m } of form.moves) (moveLearners.get(m) ?? moveLearners.set(m, new Set()).get(m)!).add(s.id);
      for (const { name: a } of form.abilities) (abilityHolders.get(a) ?? abilityHolders.set(a, new Set()).get(a)!).add(s.id);
    }
  }
  const inRange = (cat: QuestionCategory, n: number) => n >= MIN_VALID_ANSWERS && n <= CATEGORY_CONFIG[cat].maxAnswers;
  const usableMoves = [...moveLearners].filter(([, set]) => inRange("move", set.size)).map(([m]) => m);
  const usableAbilities = [...abilityHolders].filter(([, set]) => inRange("ability", set.size)).map(([a]) => a);
  const moveInfo = await mapLimit(usableMoves, (m) => cached(`move/${m}`, trimMove, 2), "moves");
  const abilityInfo = await mapLimit(usableAbilities, (a) => cached(`ability/${a}`, trimAbility, 2), "abilities");

  // Familiarity: prompts only use moves/abilities from the classic era, so
  // "can learn X" doesn't become a test of specialised trivia.
  for (const mv of moveInfo.filter((m) => m.gen <= PROMPT_FAMILIARITY.moveMaxGeneration)) {
    const c = candidate({ id: `move:${mv.slug}`, category: "move", label: "MOVE", prompt: `Name a Pokémon that can learn ${mv.name}.` });
    for (const s of species) {
      addMatch(
        c,
        s.id,
        (f) => f.moves.some((m) => m.name === mv.slug),
        // Level-up learners that share the move's type are the textbook answers;
        // TM/egg/tutor-only learners without the type are the deep cuts.
        (f) => {
          const levelUp = f.moves.some((m) => m.name === mv.slug && m.levelUp);
          const stab = f.types.includes(mv.type);
          return levelUp && stab ? "strong" : !levelUp && !stab ? "weak" : null;
        },
      );
    }
  }
  for (const ab of abilityInfo.filter((a) => a.gen <= PROMPT_FAMILIARITY.abilityMaxGeneration)) {
    const c = candidate({ id: `ability:${ab.slug}`, category: "ability", label: "ABILITY", prompt: `Name a Pokémon that can have the ability ${ab.name}.` });
    for (const s of species) {
      addMatch(
        c,
        s.id,
        (f) => f.abilities.some((a) => a.name === ab.slug),
        (f) => (f.abilities.some((a) => a.name === ab.slug && !a.hidden) ? "strong" : "weak"),
      );
    }
  }

  // Evolution methods (credited to the Pokémon that evolves, not the result).
  const itemSlugs = [...new Set(allLinks.filter((l) => l.trigger === "use-item" && l.item).map((l) => l.item!))];
  const itemNames = await mapLimit(itemSlugs, (i) => cached(`item/${i}`, trimNamed), "items");
  for (const it of itemNames) {
    const c = candidate({ id: `evo:item-${it.slug}`, category: "evolution", label: "EVOLUTION", prompt: `Name a Pokémon that evolves using ${article(it.name)} ${it.name}.` });
    for (const l of allLinks) if (l.trigger === "use-item" && l.item === it.slug && bySlug.has(l.from)) c.answers.set(bySlug.get(l.from)!.id, null);
  }
  {
    const trade = candidate({ id: "evo:trade", category: "evolution", label: "EVOLUTION", prompt: "Name a Pokémon that evolves by trading." });
    const friend = candidate({ id: "evo:friendship", category: "evolution", label: "EVOLUTION", prompt: "Name a Pokémon that evolves through high friendship." });
    for (const l of allLinks) {
      const from = bySlug.get(l.from);
      if (!from) continue;
      if (l.trigger === "trade") trade.answers.set(from.id, null);
      if (l.happiness) friend.answers.set(from.id, null);
    }
  }

  // 5b. Type effectiveness (current generation) for Team Synergy.
  const typeInfo = await mapLimit(
    TYPES,
    (t) =>
      cached(`type/${t}`, (x: any) => ({
        name: x.name as PokemonType,
        double: x.damage_relations.double_damage_to.map((d: any) => d.name),
        half: x.damage_relations.half_damage_to.map((d: any) => d.name),
        none: x.damage_relations.no_damage_to.map((d: any) => d.name),
      })),
    "types",
  );
  /** chart[attacker][defender] = multiplier; only non-1× entries are stored. */
  const chart: Record<string, Record<string, number>> = {};
  for (const t of typeInfo) {
    chart[t.name] = {};
    for (const d of t.double) if (TYPES.includes(d)) chart[t.name][d] = 2;
    for (const d of t.half) if (TYPES.includes(d)) chart[t.name][d] = 0.5;
    for (const d of t.none) if (TYPES.includes(d)) chart[t.name][d] = 0;
  }
  // Sanity checks against well-known matchups.
  const expectMult = (a: string, d: string, m: number) => {
    if ((chart[a]?.[d] ?? 1) !== m) throw new Error(`type chart: ${a}→${d} expected ${m}, got ${chart[a]?.[d] ?? 1}`);
  };
  expectMult("ground", "flying", 0);
  expectMult("ghost", "normal", 0);
  expectMult("dragon", "fairy", 0);
  expectMult("water", "fire", 2);
  expectMult("fire", "water", 0.5);
  expectMult("steel", "fairy", 2);
  expectMult("normal", "normal", 1);

  // Regional form typings (answers that only qualify via a regional form are
  // scored with that form's types in Team Synergy).
  const regionalForms: Record<number, { species: number; types: PokemonType[] }> = {};
  for (const [speciesId, fs] of formsBySpecies) {
    for (const f of fs) if (f.regional) regionalForms[f.form.id] = { species: speciesId, types: f.form.types };
  }

  // 5c. Expanded trivia categories (stats, size, Pokédex info, matchups, evolution, locations, name patterns).
  addExpandedCandidates({
    species,
    forms: formsBySpecies,
    encounters: encountersBySpecies,
    links: allLinks,
    stageOf,
    hasChildren,
    hasParent,
    chart,
    types: TYPES,
    candidate: (c) => candidate(c),
    addMatch: (c, id, matches) => addMatch(c as Candidate, id, matches),
    // Threshold prompts aim for these raw answer counts (easy 60+, medium 25–59, challenging 12–24).
    bandTargets: [
      { id: "easy", min: 60, max: 180 },
      { id: "medium", min: 25, max: 59 },
      { id: "hard", min: MIN_VALID_ANSWERS, max: 24 },
    ],
  });

  const DEFAULT_FAMILY: Partial<Record<QuestionCategory, string>> = {
    type: "type", dualType: "dual", typeGeneration: "typegen", letter: "name", move: "move", ability: "ability",
    generation: "generation", evolution: "evo",
  };
  const DEFAULT_DESCRIPTION: Partial<Record<QuestionCategory, string>> = {
    type: "Current typing. Standard or regional form (Alolan, Galarian, Hisuian, Paldean).",
    dualType: "Exactly these two types, current typing. Standard or regional form.",
    typeGeneration: "Current typing; generation = when the species debuted. Standard or regional form.",
    letter: "Official English name; accents ignored.",
    move: "Learnable by any method (level-up, TM/TR, egg, tutor) in any main-series game.",
    ability: "Includes Hidden Abilities. Standard or regional form.",
    generation: "When the species debuted (regional forms don't change it).",
    evolution: "Credited to the Pokémon that evolves, not its evolution.",
  };
  const typesOfAnswer = (speciesId: number, formId: number | null) => {
    const fs = formsBySpecies.get(speciesId)!;
    return (formId != null ? fs.find((f) => f.form.id === formId)?.form : fs.find((f) => !f.regional)?.form)!.types;
  };
  const weakShare = (c: Candidate) =>
    TYPES.filter((atk) => {
      let weak = 0;
      for (const [id, formId] of c.answers) {
        const m = typesOfAnswer(id, formId).reduce((x, d) => x * (chart[atk]?.[d] ?? 1), 1);
        if (m > 1) weak++;
      }
      return c.answers.size > 0 && weak / c.answers.size >= FORCED_WEAKNESS_SHARE;
    });

  // 6. Filter by configured answer-count bounds + verify every answer set.
  const speciesIds = new Set(pokedex.map((p) => p.id));
  const questions: Question[] = [];
  for (const c of candidates) {
    const n = c.answers.size;
    if (!inRange(c.category, n)) continue;
    const answers = [...c.answers.keys()].sort((a, b) => a - b);
    if (answers.some((id) => !speciesIds.has(id))) throw new Error(`${c.id}: answer outside pokédex`);
    const forms: Record<number, number> = {};
    for (const [sid, fid] of c.answers) if (fid != null) forms[sid] = fid;
    const { strong, weak, ...rest } = c;
    const forcedWeak = weakShare(c);
    questions.push({
      ...rest,
      family: c.family ?? DEFAULT_FAMILY[c.category] ?? c.category,
      ...(c.description || DEFAULT_DESCRIPTION[c.category] ? { description: c.description ?? DEFAULT_DESCRIPTION[c.category] } : {}),
      ...(c.id.startsWith("dex:multiple") || c.id.startsWith("dex:ends") ? { conceptFactor: 0.5 } : {}),
      ...(forcedWeak.length ? { forcedWeak } : {}),
      answers,
      ...(Object.keys(forms).length ? { forms } : {}),
      ...(strong.size ? { strong: [...strong].sort((a, b) => a - b) } : {}),
      ...(weak.size ? { weak: [...weak].sort((a, b) => a - b) } : {}),
    });
  }

  const now = new Date().toISOString();
  const datasetVersion = `pokeapi-${now.slice(0, 10)}`;
  await writeFile(
    path.join(OUT_DIR, "pokedex.json"),
    JSON.stringify({ datasetVersion, generatedAt: now, source: API, species: pokedex, regionalForms }),
  );
  await writeFile(
    path.join(OUT_DIR, "typechart.json"),
    JSON.stringify({ datasetVersion, generatedAt: now, source: `${API}/type`, types: TYPES, chart }),
  );
  await writeFile(
    path.join(OUT_DIR, "questions.json"),
    JSON.stringify({ datasetVersion, generatedAt: now, questions }),
  );

  const byCat: Record<string, number> = {};
  for (const q of questions) byCat[q.category] = (byCat[q.category] ?? 0) + 1;
  console.log(`\n✔ ${pokedex.length} species, ${questions.length} questions`, byCat);
  console.log(`  ${requests} HTTP requests, ${cacheHits} cache hits → ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
