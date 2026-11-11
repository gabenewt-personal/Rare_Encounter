/**
 * Derived properties of a prompt, shared by the data build, the curated
 * wildcard loader, the daily generator and the quality report.
 */
import { CATEGORY_CONFIG, DIFFICULTY_BANDS, FORCED_WEAKNESS_SHARE, type Difficulty } from "@/config/game";
import type { PokemonType, Question } from "@/data/types";
import { answerTypes } from "@/lib/pokedex";
import { ALL_TYPES, defensiveMultiplier } from "@/lib/synergy";

/** Attacking types that most of a prompt's answers are weak to. */
export function forcedWeaknesses(answers: readonly number[], forms?: Record<number, number>): PokemonType[] {
  if (!answers.length) return [];
  return ALL_TYPES.filter((atk) => {
    const weak = answers.filter((id) => defensiveMultiplier(atk, answerTypes(id, forms?.[id])) > 1).length;
    return weak / answers.length >= FORCED_WEAKNESS_SHARE;
  });
}

/** Raw answers × conceptual-difficulty factor. */
export function effectiveAnswerCount(q: Question): number {
  return q.answers.length * (q.conceptFactor ?? CATEGORY_CONFIG[q.category]?.conceptFactor ?? 1);
}

export function difficultyBand(q: Question): Difficulty {
  const n = effectiveAnswerCount(q);
  if (n >= DIFFICULTY_BANDS.easy.minAnswers) return "easy";
  if (n >= DIFFICULTY_BANDS.medium.minAnswers) return "medium";
  return "hard";
}

export function familyOf(q: Question): string {
  return q.family ?? q.category;
}

/** Generation a prompt is about, if any (generation & type+generation prompts). */
export function generationTag(q: Question): number | null {
  const m = /^(?:gen:(\d)|typegen:[a-z]+-(\d))$/.exec(q.id);
  return m ? Number(m[1] ?? m[2]) : null;
}
