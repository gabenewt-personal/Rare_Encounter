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
export const CHALLENGE_SEED_VERSION = "v4";

/** Day #1 of the game. Challenge numbers count up from here. */
export const CHALLENGE_EPOCH = "2026-01-01";

/* ------------------------------------------------------------------ */
/* Difficulty + daily layout                                           */
/* ------------------------------------------------------------------ */

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Difficulty bands compare an *effective* answer count: raw valid answers ×
 * the category's `conceptFactor` (harder concepts — locations, Pokédex
 * numbers — count as fewer). Guidelines: easy 60+, medium 25–59,
 * challenging 12–24.
 */
export const DIFFICULTY_BANDS: Record<Difficulty, { label: string; minAnswers: number; maxAnswers: number }> = {
  easy: { label: "EASY", minAnswers: 60, maxAnswers: Infinity },
  medium: { label: "MEDIUM", minAnswers: 25, maxAnswers: 59 },
  hard: { label: "CHALLENGING", minAnswers: 0, maxAnswers: 24 },
};

/** Prompts with fewer RAW valid answers than this are never generated. */
export const MIN_VALID_ANSWERS = 12;

/**
 * The shape of every daily challenge, in play order. Six prompts = a full
 * six-Pokémon party for Team Synergy.
 */
export const DAILY_LAYOUT: Difficulty[] = ["easy", "easy", "medium", "medium", "medium", "hard"];

/**
 * Team diversity: a Pokémon type may be the subject of at most this many of
 * a day's prompts (e.g. never "Ground-type" + "Ground/Rock" + "Ground Gen IV"),
 * so the day never forces a party full of shared weaknesses.
 */
export const MAX_PROMPTS_PER_TYPE = 1;

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
  // core
  | "type"
  | "dualType"
  | "typeGeneration"
  | "letter"
  | "move"
  | "ability"
  // expanded trivia
  | "generation"
  | "evolution"
  | "stat"
  | "location"
  | "pokedex"
  | "typeMatchup"
  | "namePattern"
  // curated
  | "wildcard";

/** Rotation groups: the four original kinds of knowledge, new trivia, curated wildcards. */
export type QuestionGroup = "core" | "trivia" | "wildcard";

export interface CategoryConfig {
  group: QuestionGroup;
  /**
   * Relative chance this category fills a slot of each difficulty (within its
   * group). 0 (or omitted) keeps the category out of that difficulty.
   */
  weights: Partial<Record<Difficulty, number>>;
  /** Questions with more valid answers are dropped (too broad for any rarity signal). */
  maxAnswers: number;
  /**
   * Conceptual difficulty: effective answer count = raw × factor. 1 = as hard
   * as the count suggests; 0.6 = recalling locations is harder than recalling
   * types, so a 40-answer location prompt plays like a 24-answer one.
   */
  conceptFactor: number;
}

export const CATEGORY_CONFIG: Record<QuestionCategory, CategoryConfig> = {
  type: { group: "core", weights: { easy: 1.0, medium: 0.6 }, maxAnswers: 400, conceptFactor: 1 },
  dualType: { group: "core", weights: { medium: 0.5, hard: 1.0 }, maxAnswers: 400, conceptFactor: 1 },
  typeGeneration: { group: "core", weights: { easy: 0.3, medium: 1.0, hard: 1.0 }, maxAnswers: 400, conceptFactor: 1 },
  letter: { group: "core", weights: { easy: 1.0, medium: 0.8, hard: 0.4 }, maxAnswers: 400, conceptFactor: 1 },
  move: { group: "core", weights: { easy: 1.2, medium: 0.8, hard: 0.3 }, maxAnswers: 450, conceptFactor: 1 },
  ability: { group: "core", weights: { easy: 0.3, medium: 0.5, hard: 0.4 }, maxAnswers: 400, conceptFactor: 1 },

  generation: { group: "trivia", weights: { easy: 0.3 }, maxAnswers: 400, conceptFactor: 1 },
  evolution: { group: "trivia", weights: { easy: 0.6, medium: 0.8, hard: 0.8 }, maxAnswers: 600, conceptFactor: 0.85 },
  stat: { group: "trivia", weights: { easy: 0.8, medium: 1.0, hard: 0.8 }, maxAnswers: 500, conceptFactor: 0.75 },
  location: { group: "trivia", weights: { easy: 0.5, medium: 0.8, hard: 0.6 }, maxAnswers: 400, conceptFactor: 0.6 },
  pokedex: { group: "trivia", weights: { easy: 0.8, medium: 1.0, hard: 0.8 }, maxAnswers: 400, conceptFactor: 0.85 },
  typeMatchup: { group: "trivia", weights: { easy: 0.8, medium: 1.0, hard: 0.6 }, maxAnswers: 600, conceptFactor: 0.9 },
  namePattern: { group: "trivia", weights: { easy: 0.6, medium: 0.8, hard: 0.6 }, maxAnswers: 500, conceptFactor: 0.7 },

  wildcard: { group: "wildcard", weights: { easy: 1, medium: 1, hard: 1 }, maxAnswers: 1025, conceptFactor: 0.9 },
};

/**
 * Weekly rotation target: of 42 prompts (7 days × 6), roughly this many come
 * from each group. Days are planned a week at a time; a slot falls back to
 * another group when its own has nothing fresh (e.g. no approved wildcards).
 */
export const WEEKLY_GROUP_QUOTA: Record<QuestionGroup, number> = { core: 24, trivia: 12, wildcard: 6 };

/** Variety guards for a single day. */
export const DAILY_VARIETY = {
  /** Prompts sharing a `family` (two base-Attack thresholds, two "can learn" prompts…) never share a day. */
  maxPerFamily: 1,
  /** Prompts that name a specific generation (Gen III, Fire-type Gen IV…) per day. */
  maxGenerationPrompts: 1,
  /**
   * Team Synergy guard: an attacking type may be a near-certain weakness
   * (≥ FORCED_WEAKNESS_SHARE of a prompt's answers weak to it) for at most
   * this many of a day's prompts.
   */
  maxForcedWeaknessPerType: 2,
};
export const FORCED_WEAKNESS_SHARE = 0.75;

/** Category rotation: weight multipliers for categories used on recent days. */
export const ROTATION_DAMPING = { yesterday: 0.3, twoDaysAgo: 0.6 };

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
/* Team Synergy (six-Pokémon party bonus)                              */
/* ------------------------------------------------------------------ */

/** A full party; the bonus needs this many valid, distinct Pokémon. */
export const TEAM_SIZE = 6;

export type SynergyTierId = "excellent" | "good" | "fair" | "poor";

export const TEAM_SYNERGY = {
  /**
   * Per attacking type: exposure = max(0, weak − (resist + immune) − allowance).
   * The allowance tolerates a little overlap, as any real party has some.
   *
   * Tuned with `npx tsx scripts/synergy-report.ts` (a year of real daily
   * challenges). The suggested starting values (allowance 2, tiers 0 / 1–2 /
   * 3–4 / 5+) rated ~50% of thoughtless parties "Excellent" and almost none
   * "Poor", so the bonus wouldn't reward planning. With the values below:
   *   players ignoring typing ≈ 16% Excellent · 37% Good · 31% Fair · 17% Poor
   *   best achievable party   ≈ 99% Excellent, never worse than Good.
   */
  overlapAllowance: 1,
  /** A 4× weakness counts as this many weak teammates (2 = it hurts double). */
  quadWeaknessWeight: 2,
  /** Checked in order; first tier whose maxExposure ≥ the team's total wins. */
  tiers: [
    { id: "excellent", label: "Excellent", maxExposure: 1, multiplier: 1.15 },
    { id: "good", label: "Good", maxExposure: 3, multiplier: 1.1 },
    { id: "fair", label: "Fair", maxExposure: 6, multiplier: 1.05 },
    { id: "poor", label: "Poor", maxExposure: Infinity, multiplier: 1.0 },
  ] as { id: SynergyTierId; label: string; maxExposure: number; multiplier: number }[],
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
