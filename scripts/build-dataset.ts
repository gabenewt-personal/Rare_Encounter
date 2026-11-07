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
import { CATEGORY_CONFIG, type QuestionCategory } from "../src/config/game";
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

async function cached<T>(endpoint: string, trim: (raw: any) => T): Promise<T> {
  const file = path.join(CACHE_DIR, endpoint.replace(/[^a-z0-9-]+/gi, "_") + ".json");
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
}
interface RawPokemon {
  id: number; slug: string; types: PokemonType[]; abilities: string[]; moves: string[];
}
interface EvoLink { from: string; to: string; trigger: string; item: string | null; happiness: boolean }
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
});

const trimPokemon = (p: any): RawPokemon => ({
  id: p.id,
  slug: p.name,
  types: p.types.sort((a: any, b: any) => a.slot - b.slot).map((t: any) => t.type.name),
  abilities: p.abilities.map((a: any) => a.ability.name),
  // Any learn method (level-up, TM/HM/TR, egg, tutor…) in any game PokéAPI records.
  moves: p.moves.map((m: any) => m.move.name),
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
        });
      }
      walk(child, depth + 1);
    }
  };
  walk(c.chain, 0);
  return { id: c.id, links, stages };
}

const trimNamed = (x: any) => ({ slug: x.name, name: en(x.names) ?? x.name });

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
  const species = await mapLimit(list, (slug) => cached(`pokemon-species/${slug}`, trimSpecies), "species");
  species.sort((a, b) => a.id - b.id);

  // 2. Default form + regional variants (Alolan, Galarian, Hisuian, Paldean).
  const formSlugs: { speciesId: number; slug: string; regional: boolean }[] = [];
  for (const s of species) {
    for (const v of s.varieties) {
      if (v.isDefault) formSlugs.push({ speciesId: s.id, slug: v.slug, regional: false });
      else if (REGIONAL.test(v.slug)) formSlugs.push({ speciesId: s.id, slug: v.slug, regional: true });
    }
  }
  const forms = await mapLimit(formSlugs, (f) => cached(`pokemon/${f.slug}`, trimPokemon), "forms");
  const formsBySpecies = new Map<number, { form: RawPokemon; regional: boolean }[]>();
  formSlugs.forEach((f, i) => {
    const arr = formsBySpecies.get(f.speciesId) ?? [];
    arr.push({ form: forms[i], regional: f.regional });
    formsBySpecies.set(f.speciesId, arr);
  });

  // 3. Evolution chains.
  const chainUrls = [...new Set(species.map((s) => s.chainUrl).filter(Boolean) as string[])];
  const chains = await mapLimit(chainUrls, (u) => cached(`evolution-chain/${idFromUrl(u)}`, trimChain), "chains");
  const stageOf = new Map<string, number>();
  const chainOf = new Map<string, number>();
  const hasChildren = new Set<string>();
  const allLinks: EvoLink[] = [];
  for (const c of chains) {
    for (const [slug, st] of Object.entries(c.stages)) {
      stageOf.set(slug, st);
      chainOf.set(slug, c.id);
    }
    for (const l of c.links) {
      hasChildren.add(l.from);
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
  type Candidate = Omit<Question, "answers" | "forms"> & { answers: Map<number, number | null> };
  const candidates: Candidate[] = [];
  /** Adds a species to a candidate; formId is set only when it qualifies via a regional form alone. */
  const addMatch = (c: Candidate, speciesId: number, matches: (f: RawPokemon) => boolean) => {
    const fs = formsBySpecies.get(speciesId)!;
    const def = fs.find((f) => !f.regional)!;
    if (matches(def.form)) c.answers.set(speciesId, null);
    else {
      const reg = fs.find((f) => f.regional && matches(f.form));
      if (reg && !c.answers.has(speciesId)) c.answers.set(speciesId, reg.form.id);
    }
  };
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  const typeName = (t: string) => cap(t);
  const article = (w: string) => (/^[AEIOU]/i.test(w) ? "an" : "a");

  // Type.
  for (const t of TYPES) {
    const c: Candidate = { id: `type:${t}`, category: "type", label: "TYPE", prompt: `Name ${article(t)} ${typeName(t)}-type Pokémon.`, answers: new Map() };
    for (const s of species) addMatch(c, s.id, (f) => f.types.includes(t));
    candidates.push(c);
  }
  // Dual type (exact pair, order-insensitive).
  for (let i = 0; i < TYPES.length; i++) {
    for (let j = i + 1; j < TYPES.length; j++) {
      const a = TYPES[i], b = TYPES[j];
      const c: Candidate = { id: `dual:${a}-${b}`, category: "dualType", label: "DUAL TYPE", prompt: `Name a Pokémon with both ${typeName(a)} and ${typeName(b)} typing.`, answers: new Map() };
      for (const s of species) addMatch(c, s.id, (f) => f.types.length === 2 && f.types.includes(a) && f.types.includes(b));
      candidates.push(c);
    }
  }
  // Generation.
  for (let g = 1; g <= 9; g++) {
    const c: Candidate = { id: `gen:${g}`, category: "generation", label: "GENERATION", prompt: `Name a Pokémon introduced in Generation ${ROMAN[g]}.`, answers: new Map() };
    for (const s of species) if (s.gen === g) c.answers.set(s.id, null);
    candidates.push(c);
  }
  // Type + generation.
  for (const t of TYPES) {
    for (let g = 1; g <= 9; g++) {
      const c: Candidate = { id: `typegen:${t}-${g}`, category: "typeGeneration", label: "TYPE + GEN", prompt: `Name ${article(t)} ${typeName(t)}-type Pokémon introduced in Generation ${ROMAN[g]}.`, answers: new Map() };
      for (const s of species) if (s.gen === g) addMatch(c, s.id, (f) => f.types.includes(t));
      candidates.push(c);
    }
  }

  // Moves & abilities: count first, then only fetch English names for usable ones.
  const moveLearners = new Map<string, Set<number>>();
  const abilityHolders = new Map<string, Set<number>>();
  for (const s of species) {
    for (const { form } of formsBySpecies.get(s.id)!) {
      for (const m of form.moves) (moveLearners.get(m) ?? moveLearners.set(m, new Set()).get(m)!).add(s.id);
      for (const a of form.abilities) (abilityHolders.get(a) ?? abilityHolders.set(a, new Set()).get(a)!).add(s.id);
    }
  }
  const inRange = (cat: QuestionCategory, n: number) => n >= CATEGORY_CONFIG[cat].minAnswers && n <= CATEGORY_CONFIG[cat].maxAnswers;
  const usableMoves = [...moveLearners].filter(([, set]) => inRange("move", set.size)).map(([m]) => m);
  const usableAbilities = [...abilityHolders].filter(([, set]) => inRange("ability", set.size)).map(([a]) => a);
  const moveNames = await mapLimit(usableMoves, (m) => cached(`move/${m}`, trimNamed), "moves");
  const abilityNames = await mapLimit(usableAbilities, (a) => cached(`ability/${a}`, trimNamed), "abilities");

  for (const mv of moveNames) {
    const c: Candidate = { id: `move:${mv.slug}`, category: "move", label: "MOVE", prompt: `Name a Pokémon that can learn ${mv.name}.`, answers: new Map() };
    for (const s of species) addMatch(c, s.id, (f) => f.moves.includes(mv.slug));
    candidates.push(c);
  }
  for (const ab of abilityNames) {
    const c: Candidate = { id: `ability:${ab.slug}`, category: "ability", label: "ABILITY", prompt: `Name a Pokémon that can have the ability ${ab.name}.`, answers: new Map() };
    for (const s of species) addMatch(c, s.id, (f) => f.abilities.includes(ab.slug));
    candidates.push(c);
  }

  // Evolution methods (credited to the Pokémon that evolves, not the result).
  const itemSlugs = [...new Set(allLinks.filter((l) => l.trigger === "use-item" && l.item).map((l) => l.item!))];
  const itemNames = await mapLimit(itemSlugs, (i) => cached(`item/${i}`, trimNamed), "items");
  for (const it of itemNames) {
    const c: Candidate = { id: `evo:item-${it.slug}`, category: "evolution", label: "EVOLUTION", prompt: `Name a Pokémon that evolves using ${article(it.name)} ${it.name}.`, answers: new Map() };
    for (const l of allLinks) if (l.trigger === "use-item" && l.item === it.slug && bySlug.has(l.from)) c.answers.set(bySlug.get(l.from)!.id, null);
    candidates.push(c);
  }
  {
    const trade: Candidate = { id: "evo:trade", category: "evolution", label: "EVOLUTION", prompt: "Name a Pokémon that evolves by trading.", answers: new Map() };
    const friend: Candidate = { id: "evo:friendship", category: "evolution", label: "EVOLUTION", prompt: "Name a Pokémon that evolves through high friendship.", answers: new Map() };
    for (const l of allLinks) {
      const from = bySlug.get(l.from);
      if (!from) continue;
      if (l.trigger === "trade") trade.answers.set(from.id, null);
      if (l.happiness) friend.answers.set(from.id, null);
    }
    candidates.push(trade, friend);
  }

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
    questions.push({ ...c, answers, ...(Object.keys(forms).length ? { forms } : {}) });
  }

  const now = new Date().toISOString();
  const datasetVersion = `pokeapi-${now.slice(0, 10)}`;
  await writeFile(
    path.join(OUT_DIR, "pokedex.json"),
    JSON.stringify({ datasetVersion, generatedAt: now, source: API, species: pokedex }),
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
