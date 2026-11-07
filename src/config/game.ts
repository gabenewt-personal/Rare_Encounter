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
export const CHALLENGE_SEED_VERSION = "v1";

/** Day #1 of the game. Challenge numbers count up from here. */
export const CHALLENGE_EPOCH = "2026-01-01";

/** Number of prompts in a daily challenge. */
export const QUESTIONS_PER_DAY = 5;

/** A category can fill at most this many of the day's prompts. */
export const MAX_PER_CATEGORY = 2;

/**
 * Target minimum gap before a prompt is reused. Guaranteed for normal pools;
 * the tiny Generation/Evolution pools (9–11 prompts) stay ≥10 days apart.
 */
export const NO_REPEAT_DAYS = 14;

/**
 * Global daily reset: every player rolls over at 00:00 UTC.
 * (Expressed as an offset so it can be moved later, e.g. -7 for 00:00 PDT.)
 */
export const RESET_UTC_OFFSET_HOURS = 0;

export type QuestionCategory =
  | "type"
  | "dualType"
  | "generation"
  | "typeGeneration"
  | "move"
  | "ability"
  | "evolution";

export interface CategoryConfig {
  /** Relative chance this category is picked for a daily slot. 0 disables it. */
  weight: number;
  /** Questions with fewer valid answers are never generated (avoids 1–2 answer prompts). */
  minAnswers: number;
  /** Questions with more valid answers are dropped (too trivial / no rarity signal). */
  maxAnswers: number;
}

export const CATEGORY_CONFIG: Record<QuestionCategory, CategoryConfig> = {
  type: { weight: 1.0, minAnswers: 20, maxAnswers: 400 },
  dualType: { weight: 1.0, minAnswers: 6, maxAnswers: 400 },
  generation: { weight: 0.35, minAnswers: 20, maxAnswers: 400 },
  typeGeneration: { weight: 1.2, minAnswers: 8, maxAnswers: 400 },
  move: { weight: 1.5, minAnswers: 15, maxAnswers: 450 },
  ability: { weight: 1.0, minAnswers: 8, maxAnswers: 200 },
  evolution: { weight: 0.35, minAnswers: 4, maxAnswers: 400 },
};

/**
 * Difficulty is derived from how many valid answers exist. Daily prompts are
 * ordered easy → hard. Bands are inclusive lower bounds on answer count.
 */
export const DIFFICULTY_BANDS = [
  { id: "easy", label: "EASY", minAnswers: 80 },
  { id: "medium", label: "MEDIUM", minAnswers: 25 },
  { id: "hard", label: "HARD", minAnswers: 0 },
] as const;

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
  regionalOnlyPenalty: 0.4,
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
