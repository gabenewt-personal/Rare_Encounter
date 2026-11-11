/**
 * Mode-agnostic question engine.
 *
 * A QuestionDeck splits the pool by (difficulty, category), picks categories by
 * configured weight, and deals questions from seeded shuffled "cycles" so every
 * prompt in a deck is used before any repeats. Callers decide what "recently
 * used" means through `isFresh` / `lastUsed` callbacks:
 *
 *  - Daily challenges: fresh = not used in the last NO_REPEAT_DAYS days.
 *  - Survival Mode (future): fresh = not yet asked in this run; difficulty
 *    ramps up by round via `difficultyForRound`.
 *
 * Nothing here knows about dates, timers, storage or scoring.
 */
import {
  CATEGORY_CONFIG,
  DIFFICULTY_BANDS,
  type Difficulty,
  type QuestionCategory,
} from "@/config/game";
import type { Question } from "@/data/types";
import { createRng, shuffle, weightedSample, type Rng } from "@/lib/random";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** Band a question falls in, by its number of valid answers (null = too few). */
export function difficultyOf(q: Question): Difficulty | null {
  const n = q.answers.length;
  for (const d of DIFFICULTIES) {
    const b = DIFFICULTY_BANDS[d];
    if (n >= b.minAnswers && n <= b.maxAnswers) return d;
  }
  return null;
}

/**
 * Pokémon types a prompt forces onto its answers ("Ground-type" → ground,
 * "Water/Ground" → water + ground). Used to keep a day's party diverse.
 */
export function typeTags(q: Question): string[] {
  const [kind, rest = ""] = q.id.split(":");
  if (kind === "type") return [rest];
  if (kind === "typegen") return [rest.split("-")[0]];
  if (kind === "dual") return rest.split("-");
  return [];
}

/** Survival Mode ramp (not used yet): easy → medium → hard as rounds go on. */
export function difficultyForRound(round: number): Difficulty {
  return round < 4 ? "easy" : round < 10 ? "medium" : "hard";
}

interface DeckState {
  cycle: number;
  order: Question[];
  queue: Question[];
}

export class QuestionDeck {
  private groups = new Map<string, Question[]>();
  private decks = new Map<string, DeckState>();

  constructor(
    pool: readonly Question[],
    private cfg: typeof CATEGORY_CONFIG = CATEGORY_CONFIG,
    private seed = "deck",
  ) {
    for (const q of pool) {
      const d = difficultyOf(q);
      if (!d || !this.weight(q.category, d)) continue;
      const key = `${d}:${q.category}`;
      const arr = this.groups.get(key) ?? [];
      arr.push(q);
      this.groups.set(key, arr);
    }
    // Stable base order, independent of file order.
    for (const arr of this.groups.values()) arr.sort((a, b) => a.id.localeCompare(b.id));
  }

  private weight(cat: QuestionCategory, d: Difficulty) {
    return this.cfg[cat]?.weights[d] ?? 0;
  }

  /** Categories that can fill a slot of this difficulty. */
  categories(d: Difficulty): QuestionCategory[] {
    return [...this.groups.keys()]
      .filter((k) => k.startsWith(`${d}:`))
      .map((k) => k.slice(d.length + 1) as QuestionCategory)
      .sort();
  }

  size(d: Difficulty, cat?: QuestionCategory): number {
    if (cat) return this.groups.get(`${d}:${cat}`)?.length ?? 0;
    return this.categories(d).reduce((s, c) => s + this.size(d, c), 0);
  }

  /** Whether any question in (difficulty, category) satisfies `ok`. */
  has(d: Difficulty, cat: QuestionCategory, ok: (q: Question) => boolean): boolean {
    return this.groups.get(`${d}:${cat}`)?.some(ok) ?? false;
  }

  pickCategory(d: Difficulty, rng: Rng, allowed: (c: QuestionCategory) => boolean = () => true): QuestionCategory | null {
    const cats = this.categories(d).filter(allowed);
    return weightedSample(cats, (c) => this.weight(c, d), 1, rng)[0] ?? null;
  }

  private cycleOrder(key: string, cycle: number, prev?: Question[]): Question[] {
    const base = this.groups.get(key)!;
    const order = shuffle(base, createRng(`${this.seed}:deck:${key}:cycle:${cycle}`));
    // Keep the previous cycle's last half out of this cycle's first half.
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

  /**
   * Deals the next question for (difficulty, category).
   * @param isFresh  preferred: not recently used
   * @param isAllowed hard constraint (e.g. not already in today's set)
   * @param lastUsed  for the fallback when nothing is fresh: least recent wins
   */
  deal(
    d: Difficulty,
    cat: QuestionCategory,
    isFresh: (q: Question) => boolean,
    isAllowed: (q: Question) => boolean = () => true,
    lastUsed: (q: Question) => number = () => -Infinity,
  ): Question {
    const key = `${d}:${cat}`;
    if (!this.groups.has(key)) throw new Error(`No questions for ${key}`);
    let st = this.decks.get(key);
    if (!st || st.queue.length === 0) {
      const cycle = st ? st.cycle + 1 : 0;
      const order = this.cycleOrder(key, cycle, st?.order);
      st = { cycle, order, queue: order.slice() };
      this.decks.set(key, st);
    }
    const ok = (q: Question) => isAllowed(q) && isFresh(q);
    let i = st.queue.findIndex(ok);
    if (i < 0) {
      // Only recently-used prompts left: open the next cycle early. Leftovers
      // keep their place; their copies in the new cycle are dropped.
      const next = this.cycleOrder(key, st.cycle + 1, st.order);
      const left = new Set(st.queue.map((q) => q.id));
      st = { cycle: st.cycle + 1, order: next, queue: [...st.queue, ...next.filter((q) => !left.has(q.id))] };
      this.decks.set(key, st);
      i = st.queue.findIndex(ok);
    }
    if (i < 0) {
      let best = Infinity;
      st.queue.forEach((q, k) => {
        const t = lastUsed(q);
        if (isAllowed(q) && t < best) [best, i] = [t, k];
      });
    }
    if (i < 0) i = 0;
    return st.queue.splice(i, 1)[0];
  }
}
