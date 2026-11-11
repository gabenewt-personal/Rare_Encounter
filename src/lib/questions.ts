/**
 * Deterministic daily challenge generator.
 *
 * No admin needs to author days. The whole sequence of challenges is a pure
 * function of (question pool, config, CHALLENGE_SEED_VERSION):
 *
 *  1. Every day follows DAILY_LAYOUT: 2 easy → 3 medium → 1 challenging.
 *  2. Weeks (7 days, 42 prompts) are planned against WEEKLY_GROUP_QUOTA
 *     (≈24 core · 12 trivia · 6 wildcard): wildcards land on 6 of the 7 days,
 *     trivia gives each day 1–2 prompts, core fills the rest.
 *  3. Each slot picks a category within its group by per-difficulty weight,
 *     then the QuestionDeck deals a question that passes the day's variety
 *     rules (DAILY_VARIETY): one prompt per family, one generation-specific
 *     prompt, one prompt per subject type, ≤2 per category, and no attacking
 *     type forced as a weakness by more than two prompts (Team Synergy).
 *  4. A question isn't reused within NO_REPEAT_DAYS days when avoidable.
 *  5. When a group has nothing eligible for a slot (e.g. no approved
 *     wildcards), the slot falls back to trivia, then core.
 *
 * Steps 3–4 need the history before day d, so the generator replays every
 * day from the epoch (memoized; a few thousand cheap picks per year).
 */
import questionsFile from "@/data/generated/questions.json";
import {
  CATEGORY_CONFIG,
  CHALLENGE_EPOCH,
  CHALLENGE_SEED_VERSION,
  DAILY_LAYOUT,
  DAILY_VARIETY,
  DIFFICULTY_BANDS,
  MAX_PER_CATEGORY,
  MAX_PROMPTS_PER_TYPE,
  NO_REPEAT_DAYS,
  ROTATION_DAMPING,
  WEEKLY_GROUP_QUOTA,
  type Difficulty,
  type QuestionCategory,
  type QuestionGroup,
} from "@/config/game";
import type { Question, QuestionPoolFile } from "@/data/types";
import { challengeNumber, daysBetween } from "@/lib/dates";
import { createRng, hashString, shuffle, type Rng } from "@/lib/random";
import { QuestionDeck, difficultyOf as bandOf, typeTags } from "@/lib/questionDeck";
import { familyOf, generationTag } from "@/lib/questionTraits";
import { wildcardQuestions } from "@/lib/wildcards";

/** Generated prompts (data build) — always available. */
export const GENERATED_QUESTIONS: readonly Question[] = (questionsFile as QuestionPoolFile).questions;
/** Everything that can rotate: generated prompts + APPROVED curated wildcards. */
export const QUESTION_POOL: readonly Question[] = [...GENERATED_QUESTIONS, ...wildcardQuestions()];

const byId = new Map([...GENERATED_QUESTIONS, ...wildcardQuestions({ includePending: true })].map((q) => [q.id, q]));
export function getQuestion(id: string): Question | undefined {
  return byId.get(id);
}

export interface GeneratorOptions {
  pool?: readonly Question[];
  categoryConfig?: typeof CATEGORY_CONFIG;
  seedVersion?: string;
  layout?: Difficulty[];
  /** Dev preview: let PENDING wildcards rotate too. */
  includePendingWildcards?: boolean;
}

export interface DailyChallenge {
  date: string;
  number: number;
  /** Stable id for this challenge (fingerprints its prompts), used to key saved progress. */
  id: string;
  questions: Question[];
}

/** Difficulty label for UI (unbanded questions fall back to CHALLENGING). */
export function difficultyOf(q: Question) {
  const d = bandOf(q) ?? "hard";
  return { id: d, label: DIFFICULTY_BANDS[d].label };
}

/** Per-day group counts for one 7-day week, seeded and deterministic. */
export function planWeek(seed: string, week: number, quota = WEEKLY_GROUP_QUOTA, perDay = DAILY_LAYOUT.length): QuestionGroup[][] {
  const rng = createRng(`${seed}:week:${week}`);
  const days = [0, 1, 2, 3, 4, 5, 6];
  const wild = new Set(shuffle(days, rng).slice(0, Math.min(7, quota.wildcard)));
  const extraWild = Math.max(0, quota.wildcard - 7);
  const triviaBase = Math.floor(quota.trivia / 7);
  const triviaExtra = new Set(shuffle(days, rng).slice(0, quota.trivia - triviaBase * 7));
  return days.map((d) => {
    const w = (wild.has(d) ? 1 : 0) + (d < extraWild ? 1 : 0);
    const t = triviaBase + (triviaExtra.has(d) ? 1 : 0);
    const c = Math.max(0, perDay - w - t);
    return [...Array(w).fill("wildcard"), ...Array(t).fill("trivia"), ...Array(c).fill("core")] as QuestionGroup[];
  });
}

/** Replays challenge history day by day. One instance per configuration. */
class ChallengeSimulator {
  private deck: QuestionDeck;
  private lastUsedDay = new Map<string, number>();
  private weeks = new Map<number, QuestionGroup[][]>();
  readonly days: Question[][] = [];

  constructor(pool: readonly Question[], private cfg: typeof CATEGORY_CONFIG, private seed: string, private layout: Difficulty[]) {
    this.deck = new QuestionDeck(pool, cfg, seed);
    for (const d of new Set(layout)) {
      if (this.deck.size(d) === 0) throw new Error(`No questions available for difficulty "${d}"`);
    }
  }

  /** Rotation: categories used on the last two days are damped (ROTATION_DAMPING). */
  private recencyFactor(c: QuestionCategory, day: number): number {
    let f = 1;
    if (this.days[day - 1]?.some((q) => q.category === c)) f *= ROTATION_DAMPING.yesterday;
    if (this.days[day - 2]?.some((q) => q.category === c)) f *= ROTATION_DAMPING.twoDaysAgo;
    return f;
  }

  private groupsForDay(day: number): QuestionGroup[] {
    const week = Math.floor(day / 7);
    if (!this.weeks.has(week)) this.weeks.set(week, planWeek(this.seed, week, WEEKLY_GROUP_QUOTA, this.layout.length));
    return this.weeks.get(week)![day % 7];
  }

  run(toDay: number) {
    for (let day = this.days.length; day <= toDay; day++) this.days.push(this.buildDay(day));
    return this.days[toDay];
  }

  private buildDay(day: number): Question[] {
    const rng = createRng(`${this.seed}:day:${day}`);
    const today: Question[] = [];
    const count = <K>(key: (q: Question) => K | K[] | null) => {
      const m = new Map<K, number>();
      for (const q of today) {
        const k = key(q);
        for (const x of Array.isArray(k) ? k : k == null ? [] : [k]) m.set(x, (m.get(x) ?? 0) + 1);
      }
      return m;
    };

    /** Hard constraints for adding `x` to today's set. */
    const allowed = (x: Question) => {
      if (today.some((q) => q.id === x.id)) return false;
      if ((count((q) => familyOf(q)).get(familyOf(x)) ?? 0) >= DAILY_VARIETY.maxPerFamily) return false;
      if ((count((q) => q.category).get(x.category) ?? 0) >= MAX_PER_CATEGORY) return false;
      const types = count((q) => typeTags(q));
      if (typeTags(x).some((t) => (types.get(t) ?? 0) >= MAX_PROMPTS_PER_TYPE)) return false;
      if (generationTag(x) != null && today.filter((q) => generationTag(q) != null).length >= DAILY_VARIETY.maxGenerationPrompts) return false;
      const weak = count((q) => q.forcedWeak ?? []);
      if ((x.forcedWeak ?? []).some((t) => (weak.get(t) ?? 0) >= DAILY_VARIETY.maxForcedWeaknessPerType)) return false;
      return true;
    };
    const fresh = (x: Question) => {
      const last = this.lastUsedDay.get(x.id);
      return last === undefined || day - last >= NO_REPEAT_DAYS;
    };
    const canFill = (d: Difficulty, g: QuestionGroup, strictFresh: boolean) =>
      this.deck.categories(d, g).some((c) => this.deck.has(d, c, (x) => allowed(x) && (!strictFresh || fresh(x))));

    // Assign groups to slots: scarce groups first, to slots that can host them.
    const slotGroup: (QuestionGroup | null)[] = this.layout.map(() => null);
    const wanted = this.groupsForDay(day);
    // A wildcard that can't be placed (none approved/fresh) becomes a trivia
    // slot, so core stays near its ~57% share.
    for (const want of (["wildcard", "trivia"] as QuestionGroup[]).flatMap((g) => wanted.filter((x) => x === g))) {
      for (const g of want === "wildcard" ? (["wildcard", "trivia"] as QuestionGroup[]) : (["trivia"] as QuestionGroup[])) {
        const open = shuffle(
          this.layout.map((d, i) => ({ d, i })).filter(({ d, i }) => slotGroup[i] == null && canFill(d, g, true)),
          rng,
        );
        if (open.length) {
          slotGroup[open[0].i] = g;
          break;
        }
      }
    }

    // Fill slots in play order; fall back trivia → core when a group runs dry.
    this.layout.forEach((d, i) => {
      const order: QuestionGroup[] = [slotGroup[i] ?? "core", "trivia", "core"];
      const q = this.pick(d, order, allowed, fresh, rng, day) ?? this.pick(d, ["core", "trivia", "wildcard"], () => true, fresh, rng, day);
      if (!q) throw new Error(`Day ${day}: nothing can fill a ${d} slot`);
      today.push(q);
    });
    for (const q of today) this.lastUsedDay.set(q.id, day);
    return today;
  }

  private pick(
    d: Difficulty,
    groups: QuestionGroup[],
    allowed: (q: Question) => boolean,
    fresh: (q: Question) => boolean,
    rng: Rng,
    day: number,
  ): Question | null {
    const notToday = (x: Question) => allowed(x);
    for (const strict of [true, false]) {
      for (const g of groups) {
        const cat: QuestionCategory | null = this.deck.pickCategory(
          d,
          rng,
          (c) => this.deck.has(d, c, (x) => notToday(x) && (!strict || fresh(x))),
          g,
          (c) => this.recencyFactor(c, day),
        );
        if (!cat) continue;
        return this.deck.deal(d, cat, fresh, notToday, (x) => this.lastUsedDay.get(x.id) ?? -Infinity);
      }
    }
    return null;
  }
}

const simulators = new Map<string, ChallengeSimulator>();
const poolSimulators = new WeakMap<readonly Question[], Map<string, ChallengeSimulator>>();

export function generateDailyChallenge(date: string, opts: GeneratorOptions = {}): DailyChallenge {
  const pool = opts.pool ?? (opts.includePendingWildcards ? [...GENERATED_QUESTIONS, ...wildcardQuestions({ includePending: true })] : QUESTION_POOL);
  const cfg = opts.categoryConfig ?? CATEGORY_CONFIG;
  const seed = opts.seedVersion ?? CHALLENGE_SEED_VERSION;
  const layout = opts.layout ?? DAILY_LAYOUT;

  // Memoize simulators: standard configs by seed/mode, custom pools by identity.
  const custom = Boolean(opts.categoryConfig || opts.layout);
  const key = `${seed}:${opts.includePendingWildcards ? "preview" : "live"}`;
  const cache = opts.pool ? poolSimulators.get(opts.pool) : undefined;
  let sim = custom ? undefined : opts.pool ? cache?.get(seed) : simulators.get(key);
  if (!sim) {
    sim = new ChallengeSimulator(pool, cfg, seed, layout);
    if (!custom && opts.pool) poolSimulators.set(opts.pool, (cache ?? new Map()).set(seed, sim));
    else if (!custom) simulators.set(key, sim);
  }

  // Days before the epoch (dev mode only) are mirrored onto positive indices.
  const day = Math.abs(daysBetween(CHALLENGE_EPOCH, date));
  const questions = sim.run(day).slice();
  // The id fingerprints the actual prompts, so a saved attempt is never
  // replayed against different questions after a data/config update.
  const fingerprint = hashString(questions.map((q) => q.id).join("|")).toString(36);
  return { date, number: challengeNumber(date), id: `${seed}:${date}:${fingerprint}`, questions };
}
