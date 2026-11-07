/**
 * Rarity + scoring.
 *
 * A RarityProvider answers one question: "for this prompt, what share of
 * players would submit each valid Pokémon?" Tiers and points are derived from
 * that share using the thresholds in config/game.ts.
 *
 * MVP: EstimatedRarityProvider — a deterministic popularity model built from
 * the dataset (generation, starters, legendaries, iconic Pokémon…). These are
 * ESTIMATES, not real player data, and the UI labels them that way.
 *
 * Later: ObservedRarityProvider takes real answer counts (e.g. a Supabase
 * snapshot frozen at the start of the challenge so scores stay identical for
 * everyone all day) and blends them with the estimate as a prior. Swapping the
 * provider requires no gameplay changes.
 */
import { MISS_POINTS, POPULARITY_MODEL, TIERS, type BallTier, type TierConfig } from "@/config/game";
import type { Question, Species } from "@/data/types";
import { getSpecies } from "@/lib/pokedex";

export interface RarityProvider {
  id: string;
  /** True when shares are modelled rather than measured. */
  isEstimate: boolean;
  /** Short UI label: "Estimated" vs "Player data". */
  label: string;
  /** Share (0–1) of submissions for each valid answer id. Sums to 1. */
  shares(question: Question): Map<number, number>;
}

/* ---------------- Estimated popularity model ---------------- */

/** Fan-favourite / mascot Pokémon that players reach for first. */
export const ICONIC_SPECIES = new Set<number>([
  1, 3, 4, 6, 7, 9, 12, 25, 26, 35, 39, 52, 54, 59, 65, 68, 76, 94, 95, 104, 129, 130, 131, 132, 133, 134, 135,
  136, 143, 144, 145, 146, 147, 149, 150, 151, 152, 155, 158, 175, 196, 197, 212, 248, 249, 250, 251, 257, 260,
  282, 359, 373, 376, 384, 445, 448, 470, 471, 491, 493, 571, 609, 658, 700, 778, 887,
]);

/** Every member of a starter evolution line (Gens 1–9). */
export const STARTER_SPECIES = new Set<number>([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 152, 153, 154, 155, 156, 157, 158, 159, 160, 252, 253, 254, 255, 256, 257, 258, 259,
  260, 387, 388, 389, 390, 391, 392, 393, 394, 395, 495, 496, 497, 498, 499, 500, 501, 502, 503, 650, 651, 652,
  653, 654, 655, 656, 657, 658, 722, 723, 724, 725, 726, 727, 728, 729, 730, 810, 811, 812, 813, 814, 815, 816,
  817, 818, 906, 907, 908, 909, 910, 911, 912, 913, 914,
]);

export function popularityScore(s: Species, model = POPULARITY_MODEL): number {
  let score = model.generationBase[s.gen] ?? 0.45;
  if (STARTER_SPECIES.has(s.id)) score += model.starterBonus;
  if (s.legendary) score += model.legendaryBonus;
  if (s.mythical) score += model.mythicalBonus;
  if (s.isFinal && s.stage > 0) score += model.fullyEvolvedBonus;
  if (ICONIC_SPECIES.has(s.id)) score += model.iconicBonus;
  if (s.id === 25) score += model.mascotBonus;
  return score;
}

/**
 * How readily a player reaches for this species *for this prompt*: general
 * familiarity (popularityScore) adjusted by the prompt's relevance hints.
 * E.g. for "learns Thunderbolt", Pikachu/Raichu (level-up, Electric) are
 * boosted while a TM-only Rattata is pushed down, though it's just as valid.
 */
export function answerLikelihood(id: number, strong: boolean, weak: boolean, model = POPULARITY_MODEL): number {
  const sp = getSpecies(id);
  if (!sp) return -Infinity;
  let score = popularityScore(sp, model);
  if (strong) score += model.strongBonus;
  if (weak) score -= model.weakPenalty;
  return score;
}

export class EstimatedRarityProvider implements RarityProvider {
  id = "estimated-v2";
  isEstimate = true;
  label = "Estimated";
  private cache = new Map<string, Map<number, number>>();
  constructor(private model = POPULARITY_MODEL) {}

  shares(question: Question): Map<number, number> {
    const hit = this.cache.get(question.id);
    if (hit) return hit;
    // Rank by prompt-specific likelihood, then Zipf by rank. Tied scores share
    // their average rank, so equally-obscure answers get equal shares.
    const strong = new Set(question.strong);
    const weak = new Set(question.weak);
    const ranked = question.answers
      .map((id) => ({ id, score: answerLikelihood(id, strong.has(id), weak.has(id), this.model) }))
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const weights = new Array<number>(ranked.length);
    for (let i = 0; i < ranked.length; ) {
      let j = i;
      while (j + 1 < ranked.length && Math.abs(ranked[j + 1].score - ranked[i].score) < 1e-9) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) weights[k] = 1 / Math.pow(avgRank, this.model.zipfExponent);
      i = j + 1;
    }
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const out = new Map(ranked.map((r, i) => [r.id, weights[i] / total]));
    this.cache.set(question.id, out);
    return out;
  }
}

/**
 * Real-data provider (ready for later). `counts` = submissions per species for
 * this question, frozen for the duration of a challenge. `priorWeight` adds
 * pseudo-counts from the estimate so early/low-volume days aren't noisy.
 */
export class ObservedRarityProvider implements RarityProvider {
  id = "observed-v1";
  isEstimate = false;
  label = "Player data";
  constructor(
    private countsFor: (questionId: string) => Map<number, number> | undefined,
    private prior: RarityProvider = new EstimatedRarityProvider(),
    private priorWeight = 50,
  ) {}

  shares(question: Question): Map<number, number> {
    const counts = this.countsFor(question.id) ?? new Map<number, number>();
    const prior = this.prior.shares(question);
    let total = 0;
    const raw = question.answers.map((id) => {
      const v = (counts.get(id) ?? 0) + this.priorWeight * (prior.get(id) ?? 0);
      total += v;
      return [id, v] as const;
    });
    return new Map(raw.map(([id, v]) => [id, total ? v / total : 0]));
  }
}

export const defaultRarityProvider: RarityProvider = new EstimatedRarityProvider();

/* ---------------- Tiers + points ---------------- */

export function tierForShare(share: number): TierConfig {
  for (const t of TIERS) if (share >= t.minShare) return t;
  return TIERS[TIERS.length - 1];
}

export function getTier(id: BallTier): TierConfig {
  return TIERS.find((t) => t.id === id)!;
}

export interface ScoredAnswer {
  correct: boolean;
  share: number;
  tier: BallTier | null;
  points: number;
}

export function scoreAnswer(question: Question, speciesId: number, provider: RarityProvider = defaultRarityProvider): ScoredAnswer {
  const share = provider.shares(question).get(speciesId);
  if (share === undefined) return { correct: false, share: 0, tier: null, points: MISS_POINTS };
  const tier = tierForShare(share);
  return { correct: true, share, tier: tier.id, points: tier.points };
}

/** Most commonly given answer (used to show "Most players said…" on a miss). */
export function topAnswers(question: Question, n = 3, provider: RarityProvider = defaultRarityProvider): number[] {
  return [...provider.shares(question)].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}
