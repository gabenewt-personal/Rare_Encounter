/**
 * Deterministic daily challenge generator.
 *
 * No admin needs to author days. The whole sequence of challenges is a pure
 * function of (question pool, config, CHALLENGE_SEED_VERSION):
 *
 *  1. Every day follows DAILY_LAYOUT: 2 easy (≥50 answers), 3 medium (15–49),
 *     1 hard (5–14), in that order — six answers make a six-Pokémon party.
 *     A type can be the subject of only one prompt per day (team diversity).
 *  2. For each slot a seeded RNG (version + day index) picks a category by its
 *     per-difficulty weight (≤ MAX_PER_CATEGORY per day).
 *  3. The QuestionDeck deals the next question for that (difficulty,
 *     category), skipping anything used in the last NO_REPEAT_DAYS days.
 *
 * Step 3 needs the history before day d, so the generator replays every day
 * from the epoch (memoized; ~1,800 cheap picks per simulated year).
 */
import questionsFile from "@/data/generated/questions.json";
import {
  CATEGORY_CONFIG,
  CHALLENGE_EPOCH,
  CHALLENGE_SEED_VERSION,
  DAILY_LAYOUT,
  DIFFICULTY_BANDS,
  MAX_PER_CATEGORY,
  MAX_PROMPTS_PER_TYPE,
  NO_REPEAT_DAYS,
  type Difficulty,
  type QuestionCategory,
} from "@/config/game";
import type { Question, QuestionPoolFile } from "@/data/types";
import { challengeNumber, daysBetween } from "@/lib/dates";
import { createRng, hashString } from "@/lib/random";
import { QuestionDeck, difficultyOf as bandOf, typeTags } from "@/lib/questionDeck";

export const QUESTION_POOL: readonly Question[] = (questionsFile as QuestionPoolFile).questions;

const byId = new Map(QUESTION_POOL.map((q) => [q.id, q]));
export function getQuestion(id: string): Question | undefined {
  return byId.get(id);
}

export interface GeneratorOptions {
  pool?: readonly Question[];
  categoryConfig?: typeof CATEGORY_CONFIG;
  seedVersion?: string;
  layout?: Difficulty[];
}

export interface DailyChallenge {
  date: string;
  number: number;
  /** Stable id for this challenge (fingerprints its prompts), used to key saved progress. */
  id: string;
  questions: Question[];
}

/** Difficulty label for UI (questions outside every band fall back to HARD). */
export function difficultyOf(q: Question) {
  const d = bandOf(q) ?? "hard";
  return { id: d, label: DIFFICULTY_BANDS[d].label };
}

/** Replays challenge history day by day. One instance per configuration. */
class ChallengeSimulator {
  private deck: QuestionDeck;
  private lastUsedDay = new Map<string, number>();
  readonly days: Question[][] = [];

  constructor(pool: readonly Question[], cfg: typeof CATEGORY_CONFIG, private seed: string, private layout: Difficulty[]) {
    this.deck = new QuestionDeck(pool, cfg, seed);
    for (const d of new Set(layout)) {
      if (this.deck.size(d) === 0) throw new Error(`No questions available for difficulty "${d}"`);
    }
  }

  run(toDay: number) {
    for (let day = this.days.length; day <= toDay; day++) {
      const rng = createRng(`${this.seed}:day:${day}`);
      const today = new Set<string>();
      const perCat = new Map<QuestionCategory, number>();
      const fresh = (x: Question) => {
        const last = this.lastUsedDay.get(x.id);
        return last === undefined || day - last >= NO_REPEAT_DAYS;
      };
      const typeUse = new Map<string, number>();
      // Not already today, and doesn't stack a type another prompt already forces.
      const notToday = (x: Question) =>
        !today.has(x.id) && typeTags(x).every((t) => (typeUse.get(t) ?? 0) < MAX_PROMPTS_PER_TYPE);
      const picked = this.layout.map((d) => {
        const underCap = (c: QuestionCategory) => (perCat.get(c) ?? 0) < MAX_PER_CATEGORY;
        // Prefer categories that still have a fresh prompt for this slot, so a
        // tiny pool (e.g. 1–2 prompts) sits out instead of repeating.
        const cat =
          this.deck.pickCategory(d, rng, (c) => underCap(c) && this.deck.has(d, c, (x) => fresh(x) && notToday(x))) ??
          this.deck.pickCategory(d, rng, (c) => this.deck.has(d, c, notToday))!;
        perCat.set(cat, (perCat.get(cat) ?? 0) + 1);
        const q = this.deck.deal(d, cat, fresh, notToday, (x) => this.lastUsedDay.get(x.id) ?? -Infinity);
        today.add(q.id);
        for (const t of typeTags(q)) typeUse.set(t, (typeUse.get(t) ?? 0) + 1);
        return q;
      });
      for (const q of picked) this.lastUsedDay.set(q.id, day);
      this.days.push(picked);
    }
    return this.days[toDay];
  }
}

const simulators = new Map<string, ChallengeSimulator>();

export function generateDailyChallenge(date: string, opts: GeneratorOptions = {}): DailyChallenge {
  const pool = opts.pool ?? QUESTION_POOL;
  const cfg = opts.categoryConfig ?? CATEGORY_CONFIG;
  const seed = opts.seedVersion ?? CHALLENGE_SEED_VERSION;
  const layout = opts.layout ?? DAILY_LAYOUT;

  // The default configuration shares one memoized simulator.
  const custom = Boolean(opts.pool || opts.categoryConfig || opts.layout);
  const key = seed;
  let sim = custom ? undefined : simulators.get(key);
  if (!sim) {
    sim = new ChallengeSimulator(pool, cfg, seed, layout);
    if (!custom) simulators.set(key, sim);
  }

  // Days before the epoch (dev mode only) are mirrored onto positive indices.
  const day = Math.abs(daysBetween(CHALLENGE_EPOCH, date));
  const questions = sim.run(day).slice();
  // The id fingerprints the actual prompts, so a saved attempt is never
  // replayed against different questions after a data/config update.
  const fingerprint = hashString(questions.map((q) => q.id).join("|")).toString(36);
  return { date, number: challengeNumber(date), id: `${seed}:${date}:${fingerprint}`, questions };
}
