/**
 * Pokémon reference data + name resolution.
 *
 * Name matching rules (deterministic, no AI):
 *  - case-insensitive, accents stripped (Flabébé = flabebe)
 *  - punctuation and spaces ignored (Mr. Mime = mr mime = mrmime, Farfetch'd = farfetchd)
 *  - gender symbols: ♀ = "f" / "female", ♂ = "m" / "male" (Nidoran♀ = Nidoran F = nidoran-female)
 *  - PokéAPI slugs are accepted (ho-oh, type-null, tapu-koko)
 *  - a few common official/legacy spellings (see EXTRA_ALIASES)
 */
import pokedexFile from "@/data/generated/pokedex.json";
import type { PokedexFile, PokemonType, Species } from "@/data/types";

const data = pokedexFile as PokedexFile;

export const DATASET_VERSION = data.datasetVersion;
export const ALL_SPECIES: readonly Species[] = data.species;

const byId = new Map<number, Species>(ALL_SPECIES.map((s) => [s.id, s]));

export function getSpecies(id: number): Species | undefined {
  return byId.get(id);
}

/** Typing of an answer: the regional form's types when that's what counted, else the default form's. */
export function answerTypes(speciesId: number, formId?: number): PokemonType[] {
  if (formId != null) {
    const f = data.regionalForms?.[String(formId)];
    if (f) return f.types;
  }
  return byId.get(speciesId)?.types ?? [];
}

/** Normalizes free-text input to a comparable key. */
export function normalizeName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining accents
    .toLowerCase()
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/\bfemale\b/g, "f")
    .replace(/\bmale\b/g, "m")
    .replace(/[^a-z0-9]/g, "");
}

/** Extra spellings people commonly type, keyed by slug. */
const EXTRA_ALIASES: Record<string, string[]> = {
  "nidoran-f": ["Nidoran Female", "Nidoran F", "NidoranF"],
  "nidoran-m": ["Nidoran Male", "Nidoran M", "NidoranM"],
  "mr-mime": ["Mister Mime", "Mr Mime"],
  "mime-jr": ["Mime Junior"],
  "mr-rime": ["Mister Rime"],
  farfetchd: ["Farfetched"],
  sirfetchd: ["Sirfetched"],
  "porygon-z": ["PorygonZ"],
  "jangmo-o": ["Jangmoo"],
  "hakamo-o": ["Hakamoo"],
  "kommo-o": ["Kommoo"],
};

const nameIndex = new Map<string, Species>();
for (const s of ALL_SPECIES) {
  for (const alias of [s.name, s.slug, ...(EXTRA_ALIASES[s.slug] ?? [])]) {
    const key = normalizeName(alias);
    if (key && !nameIndex.has(key)) nameIndex.set(key, s);
  }
}

/** Resolves a typed answer to exactly one species, or undefined. */
export function findSpeciesByName(input: string): Species | undefined {
  const key = normalizeName(input);
  return key ? nameIndex.get(key) : undefined;
}

/** Autocomplete: prefix matches first, then substring matches, by Dex order. */
export function searchSpecies(input: string, limit = 8): Species[] {
  const key = normalizeName(input);
  if (!key) return [];
  const prefix: Species[] = [];
  const contains: Species[] = [];
  for (const s of ALL_SPECIES) {
    const n = normalizeName(s.name);
    if (n.startsWith(key)) prefix.push(s);
    else if (n.includes(key)) contains.push(s);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}
