/**
 * Deterministic daily challenge generator.
 *
 * No admin needs to author days. The whole sequence of challenges is a pure
 * function of (question pool, config, CHALLENGE_SEED_VERSION):
 *
 *  1. Each day, a seeded RNG (seed = version + day index) fills
 *     QUESTIONS_PER_DAY slots with categories using the configured weights,
 *     at most MAX_PER_CATEGORY per day — weights control how often each
 *     category (and its pool) gets used.
 *  2. Each category deals questions from a seeded shuffle of its pool, one
 *     "cycle" at a time, so every question is used before any repeats. A new
 *     cycle keeps the previous cycle's last half out of its first half.
 *  3. A question used in the last NO_REPEAT_DAYS days is skipped (the next
 *     eligible one is dealt instead, the skipped one stays at the front).
 *  4. The day's prompts are ordered easy → hard by number of valid answers.
 *
 * Steps 2–3 need the history before day d, so the generator replays every day
 * from the epoch — about 1,500 cheap picks per simulated year, memoized.
 */
import questionsFile from "@/data/generated/questions.json";
import {
  CATEGORY_CONFIG,
  CHALLENGE_EPOCH,
  CHALLENGE_SEED_VERSION,
  DIFFICULTY_BANDS,
  MAX_PER_CATEGORY,
  NO_REPEAT_DAYS,
  QUESTIONS_PER_DAY,
  type QuestionCategory,
} from "@/config/game";
import type { Question, QuestionPoolFile } from "@/data/types";
import { challengeNumber, daysBetween } from "@/lib/dates";
import { createRng, hashString, shuffle, weightedSample } from "@/lib/random";

export const QUESTION_POOL: readonly Question[] = (questionsFile as QuestionPoolFile).questions;

export interface GeneratorOptions {
  pool?: readonly Question[];
  categoryConfig?: typeof CATEGORY_CONFIG;
  seedVersion?: string;
  questionsPerDay?: number;
}

export interface DailyChallenge {
  date: string;
  number: number;
  /** Stable id for this challenge, used to key saved progress. */
  id: string;
  questions: Question[];
}

export function difficultyOf(q: Question) {
  return DIFFICULTY_BANDS.find((b) => q.answers.length >= b.minAnswers) ?? DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1];
}

function groupByCategory(pool: readonly Question[]) {
  const map = new Map<QuestionCategory, Question[]>();
  for (const q of pool) {
    const arr = map.get(q.category) ?? [];
    arr.push(q);
    map.set(q.category, arr);
  }
  // Stable base order, independent of file order.
  for (const arr of map.values()) arr.sort((a, b) => a.id.localeCompare(b.id));
  return map;
}

/** The shuffled order of a category pool for one cycle. */
function cycleOrder(cat: QuestionCategory, cycle: number, base: Question[], seed: string, prev?: Question[]): Question[] {
  const order = shuffle(base, createRng(`${seed}:cat:${cat}:cycle:${cycle}`));
  if (prev && order.length > 1) {
    const half = Math.floor(order.length / 2);
    const recent = new Set(prev.slice(prev.length - half).map((q) => q.id));
    let j = half;
    for (let i = 0; i < half; i++) {
      if (!recent.has(order[i].id)) continue;
      while (j < order.length && recent.has(order[j].id)) j++;
      if (j >= order.length) break;
      [order[i], order[j]] = [order[j], order[i]];
      j++;
    }
  }
  return order;
}

/** Replays challenge history day by day. One instance per configuration. */
class ChallengeSimulator {
  private groups: Map<QuestionCategory, Question[]>;
  private cats: QuestionCategory[];
  private deck = new Map<QuestionCategory, { cycle: number; order: Question[]; queue: Question[] }>();
  private lastUsedDay = new Map<string, number>();
  readonly days: Question[][] = [];

  constructor(pool: readonly Question[], private cfg: typeof CATEGORY_CONFIG, private seed: string, private n: number) {
    this.groups = groupByCategory(pool);
    this.cats = [...this.groups.keys()].filter((c) => (cfg[c]?.weight ?? 0) > 0).sort();
    if (this.cats.length * MAX_PER_CATEGORY < n) throw new Error(`Not enough enabled categories for ${n} prompts`);
  }

  private categoriesForDay(day: number): QuestionCategory[] {
    const rng = createRng(`${this.seed}:day:${day}`);
    const slots = this.cats.flatMap((c) => Array.from({ length: MAX_PER_CATEGORY }, () => c));
    return weightedSample(slots, (c) => this.cfg[c].weight, this.n, rng);
  }

  private deal(cat: QuestionCategory, day: number, today: Set<string>): Question {
    let d = this.deck.get(cat);
    if (!d || d.queue.length === 0) {
      const cycle = d ? d.cycle + 1 : 0;
      const order = cycleOrder(cat, cycle, this.groups.get(cat)!, this.seed, d?.order);
      d = { cycle, order, queue: order.slice() };
      this.deck.set(cat, d);
    }
    const fresh = (q: Question) => {
      const last = this.lastUsedDay.get(q.id);
      return !today.has(q.id) && (last === undefined || day - last >= NO_REPEAT_DAYS);
    };
    let i = d.queue.findIndex(fresh);
    if (i < 0) {
      // Only recently-used prompts left: open the next cycle early. Leftovers
      // keep their place; their copies in the new cycle are dropped.
      const next = cycleOrder(cat, d.cycle + 1, this.groups.get(cat)!, this.seed, d.order);
      const left = new Set(d.queue.map((q) => q.id));
      d = { cycle: d.cycle + 1, order: next, queue: [...d.queue, ...next.filter((q) => !left.has(q.id))] };
      this.deck.set(cat, d);
      i = d.queue.findIndex(fresh);
    }
    if (i < 0) {
      // Still nothing eligible (tiny pool, busy stretch): least recently used wins.
      let best = Infinity;
      d.queue.forEach((q, k) => {
        const last = this.lastUsedDay.get(q.id) ?? -Infinity;
        if (!today.has(q.id) && last < best) [best, i] = [last, k];
      });
    }
    if (i < 0) i = 0;
    return d.queue.splice(i, 1)[0];
  }

  run(toDay: number) {
    for (let day = this.days.length; day <= toDay; day++) {
      const today = new Set<string>();
      const picked = this.categoriesForDay(day).map((cat) => {
        const q = this.deal(cat, day, today);
        today.add(q.id);
        return q;
      });
      for (const q of picked) this.lastUsedDay.set(q.id, day);
      picked.sort((a, b) => b.answers.length - a.answers.length || a.id.localeCompare(b.id));
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
  const n = opts.questionsPerDay ?? QUESTIONS_PER_DAY;

  // The default configuration shares one memoized simulator.
  const custom = Boolean(opts.pool || opts.categoryConfig);
  const key = `${seed}:${n}`;
  let sim = custom ? undefined : simulators.get(key);
  if (!sim) {
    sim = new ChallengeSimulator(pool, cfg, seed, n);
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
