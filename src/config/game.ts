/**
 * Central, tweakable game configuration.
 *
 * Everything that affects which questions appear, how answers are scored and
 * how streaks are ranked lives here, so balancing the game never requires
 * touching gameplay code. Changing CHALLENGE_SEED_VERSION reshuffles every
 * future (and past) daily challenge — only do that deliberately.
 */

export const GAME_TITLE = "Rare Encounter";

/** Bump only when you intentionally want a new sequence of daily challenges. */
export const CHALLENGE_SEED_VERSION = "v2";

/** Day #1 of the game. Challenge numbers count up from here. */
export const CHALLENGE_EPOCH = "2026-01-01";

/* ------------------------------------------------------------------ */
/* Difficulty + daily layout                                           */
/* ------------------------------------------------------------------ */

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Difficulty comes from how many valid answers a prompt has (inclusive bounds).
 * Prompts with fewer than `hard.minAnswers` answers are never generated.
 */
export const DIFFICULTY_BANDS: Record<Difficulty, { label: string; minAnswers: number; maxAnswers: number }> = {
  easy: { label: "EASY", minAnswers: 50, maxAnswers: Infinity },
  medium: { label: "MEDIUM", minAnswers: 15, maxAnswers: 49 },
  hard: { label: "HARD", minAnswers: 5, maxAnswers: 14 },
};

/** The shape of every daily challenge, in play order. */
export const DAILY_LAYOUT: Difficulty[] = ["easy", "easy", "medium", "medium", "hard"];

/** Number of prompts in a daily challenge. */
export const QUESTIONS_PER_DAY = DAILY_LAYOUT.length;

/** A category can fill at most this many of the day's prompts. */
export const MAX_PER_CATEGORY = 2;

/**
 * Target minimum gap before a prompt is reused. Guaranteed for normal pools;
 * tiny pools (e.g. hard Evolution prompts) may come back sooner.
 */
export const NO_REPEAT_DAYS = 14;

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

/** Seconds per prompt. Running out scores 0 and moves on. No speed bonus. */
export const QUESTION_TIME_LIMIT_SECONDS = 20;
/** The countdown turns urgent (red, ticking) for the last N seconds. */
export const TIMER_URGENT_SECONDS = 5;

/* ------------------------------------------------------------------ */
/* Reset                                                               */
/* ------------------------------------------------------------------ */

/**
 * Global daily reset: every player rolls over at 00:00 UTC.
 * (Expressed as an offset so it can be moved later, e.g. -7 for 00:00 PDT.)
 */
export const RESET_UTC_OFFSET_HOURS = 0;
export const RESET_TIMEZONE_LABEL = "UTC";

/* ------------------------------------------------------------------ */
/* Question categories                                                 */
/* ------------------------------------------------------------------ */

export type QuestionCategory =
  | "type"
  | "dualType"
  | "generation"
  | "typeGeneration"
  | "move"
  | "ability"
  | "evolution"
  | "letter";

export interface CategoryConfig {
  /**
   * Relative chance this category fills a slot of each difficulty.
   * 0 (or omitted) keeps the category out of that difficulty.
   */
  weights: Partial<Record<Difficulty, number>>;
  /** Questions with more valid answers are dropped (too broad for any rarity signal). */
  maxAnswers: number;
}

export const CATEGORY_CONFIG: Record<QuestionCategory, CategoryConfig> = {
  type: { weights: { easy: 1.0, medium: 0.6 }, maxAnswers: 400 },
  generation: { weights: { easy: 0.5 }, maxAnswers: 400 },
  letter: { weights: { easy: 1.0, medium: 0.8, hard: 0.4 }, maxAnswers: 400 },
  move: { weights: { easy: 1.2, medium: 0.8 }, maxAnswers: 450 },
  typeGeneration: { weights: { easy: 0.3, medium: 1.0, hard: 1.2 }, maxAnswers: 400 },
  ability: { weights: { easy: 0.3, medium: 0.6, hard: 0.2 }, maxAnswers: 400 },
  dualType: { weights: { medium: 0.5, hard: 1.2 }, maxAnswers: 400 },
  evolution: { weights: { medium: 0.6, hard: 0.6 }, maxAnswers: 400 },
};

/**
 * Familiarity filter for prompt *subjects*: only moves/abilities introduced
 * up to these generations are asked about ("Thunderbolt", not "Alluring
 * Voice"). Answers can still come from every generation.
 */
export const PROMPT_FAMILIARITY = { moveMaxGeneration: 4, abilityMaxGeneration: 4 };

/* ------------------------------------------------------------------ */
/* Rarity tiers                                                        */
/* ------------------------------------------------------------------ */

export type BallTier = "poke" | "great" | "ultra" | "master";

export interface TierConfig {
  id: BallTier;
  label: string;
  rarityLabel: string;
  /** Answer qualifies when its share of submissions is >= this value. */
  minShare: number;
  points: number;
}

/** Ordered from most common to rarest. */
export const TIERS: TierConfig[] = [
  { id: "poke", label: "Poké Ball", rarityLabel: "Common", minShare: 0.2, points: 10 },
  { id: "great", label: "Great Ball", rarityLabel: "Uncommon", minShare: 0.05, points: 25 },
  { id: "ultra", label: "Ultra Ball", rarityLabel: "Rare", minShare: 0.01, points: 50 },
  { id: "master", label: "Master Ball", rarityLabel: "Extremely rare", minShare: 0, points: 100 },
];

export const MISS_POINTS = 0;

/* ------------------------------------------------------------------ */
/* Estimated popularity model (used until real answer data exists)     */
/* ------------------------------------------------------------------ */

export const POPULARITY_MODEL = {
  /** Base familiarity by generation of introduction. */
  generationBase: { 1: 1.0, 2: 0.72, 3: 0.68, 4: 0.62, 5: 0.5, 6: 0.52, 7: 0.5, 8: 0.45, 9: 0.45 } as Record<number, number>,
  starterBonus: 0.3,
  legendaryBonus: 0.15,
  mythicalBonus: 0.05,
  fullyEvolvedBonus: 0.08,
  iconicBonus: 0.55,
  /** Extra pull for the franchise mascot (Pikachu). */
  mascotBonus: 0.45,
  /**
   * Prompt-specific relevance (set per answer by the data pipeline):
   * "strong" = the textbook answer for THIS prompt (primary type, level-up +
   * same-type move learner, regular ability); "weak" = a technically-correct
   * deep cut (regional form only, TM/egg-only off-type learner, hidden ability).
   */
  strongBonus: 0.5,
  weakPenalty: 0.45,
  /**
   * Answers are ranked by popularity score within each prompt; share of
   * submissions ∝ 1 / rank^zipfExponent. Higher = more top-heavy.
   */
  zipfExponent: 1.1,
};

/* ------------------------------------------------------------------ */
/* Trainer classes (streak ranks)                                      */
/* ------------------------------------------------------------------ */

export const TRAINER_CLASSES = [
  { minStreak: 1, name: "Youngster" },
  { minStreak: 3, name: "Bug Catcher" },
  { minStreak: 7, name: "Camper" },
  { minStreak: 14, name: "Ace Trainer" },
  { minStreak: 30, name: "Veteran" },
  { minStreak: 60, name: "Gym Leader" },
  { minStreak: 100, name: "Elite Four" },
  { minStreak: 365, name: "Champion" },
] as const;

export const UNRANKED_CLASS_NAME = "Rookie";
