import type { QuestionCategory } from "@/config/game";

export type PokemonType =
  | "normal" | "fire" | "water" | "grass" | "electric" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic" | "bug"
  | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";

/** One Pokémon species (the unit players answer with). */
export interface Species {
  /** National Pokédex number. */
  id: number;
  /** PokéAPI slug, e.g. "mr-mime". */
  slug: string;
  /** Official English name, e.g. "Mr. Mime". */
  name: string;
  /** Generation the species was introduced in (1–9). */
  gen: number;
  /** Current-generation typing of the default form. */
  types: PokemonType[];
  legendary: boolean;
  mythical: boolean;
  baby: boolean;
  /** 0 = unevolved, 1 = first evolution, 2 = second evolution. */
  stage: number;
  /** True when nothing evolves from this species. */
  isFinal: boolean;
  /** Evolution chain id (groups a family). */
  chain: number;
}

export interface Question {
  /** Stable id, e.g. "type:ghost" or "move:thunderbolt". */
  id: string;
  category: QuestionCategory;
  prompt: string;
  /** Short label for the category chip, e.g. "TYPE". */
  label: string;
  /** National Dex ids of every valid answer. */
  answers: number[];
  /**
   * When a species only qualifies through a regional form, the PokéAPI
   * pokemon id of that form (used to show the matching sprite).
   */
  forms?: Record<number, number>;
}

export interface PokedexFile {
  datasetVersion: string;
  generatedAt: string;
  source: string;
  species: Species[];
}

export interface QuestionPoolFile {
  datasetVersion: string;
  generatedAt: string;
  questions: Question[];
}
