/**
 * Answer validation — pure and deterministic.
 *
 * Results:
 *  - "empty" / "unknown": not a Pokémon name → player may try again (no turn used)
 *  - "duplicate": species already submitted today → try again (no turn used)
 *  - "incorrect": a real Pokémon that doesn't fit the prompt → turn used, 0 pts
 *  - "correct": fits the prompt → scored by rarity
 */
import type { Question, Species } from "@/data/types";
import { findSpeciesByName } from "@/lib/pokedex";
import { defaultRarityProvider, scoreAnswer, type RarityProvider, type ScoredAnswer } from "@/lib/rarity";

export type ValidationResult =
  | { kind: "empty" }
  | { kind: "unknown"; input: string }
  | { kind: "duplicate"; species: Species }
  | { kind: "incorrect"; species: Species; score: ScoredAnswer }
  | { kind: "correct"; species: Species; score: ScoredAnswer; formId?: number };

export function isValidAnswer(question: Question, speciesId: number): boolean {
  return question.answers.includes(speciesId);
}

export function validateAnswer(
  input: string,
  question: Question,
  usedSpeciesIds: Iterable<number>,
  provider: RarityProvider = defaultRarityProvider,
): ValidationResult {
  if (!input.trim()) return { kind: "empty" };
  const species = findSpeciesByName(input);
  if (!species) return { kind: "unknown", input };
  if (new Set(usedSpeciesIds).has(species.id)) return { kind: "duplicate", species };
  const score = scoreAnswer(question, species.id, provider);
  if (!score.correct) return { kind: "incorrect", species, score };
  return { kind: "correct", species, score, formId: question.forms?.[species.id] };
}
