/**
 * Curated wildcard prompts (src/content/wildcards.json).
 *
 * Unlike generated prompts, these are subjective or descriptive ("has more
 * than one head"), so their accepted answers are a hand-reviewed list — no AI
 * judges answers at runtime. Only entries with status "approved" and at least
 * MIN_VALID_ANSWERS resolvable names enter the rotation. Editing the JSON is
 * all it takes to add, change, approve or retire a prompt.
 */
import file from "@/content/wildcards.json";
import { MIN_VALID_ANSWERS } from "@/config/game";
import type { Question } from "@/data/types";
import { findSpeciesByName } from "@/lib/pokedex";
import { forcedWeaknesses } from "@/lib/questionTraits";

export type WildcardStatus = "pending" | "approved" | "rejected";

export interface WildcardEntry {
  id: string;
  prompt: string;
  description?: string;
  /** "visual": judged from official artwork; "concept": what the design is based on. */
  basis: "visual" | "concept";
  status: WildcardStatus;
  answers: string[];
  reviewNotes?: string;
}

export const WILDCARD_ENTRIES: readonly WildcardEntry[] = (file as { prompts: WildcardEntry[] }).prompts;

export interface ResolvedWildcard {
  entry: WildcardEntry;
  question: Question;
  /** Names that didn't match any Pokémon (typos). */
  unresolved: string[];
  /** Names listed more than once (after resolving aliases). */
  duplicates: string[];
  /** Eligible for rotation: approved and enough valid answers. */
  eligible: boolean;
}

export function resolveWildcard(entry: WildcardEntry): ResolvedWildcard {
  const ids: number[] = [];
  const unresolved: string[] = [];
  const duplicates: string[] = [];
  for (const name of entry.answers) {
    const sp = findSpeciesByName(name);
    if (!sp) unresolved.push(name);
    else if (ids.includes(sp.id)) duplicates.push(name);
    else ids.push(sp.id);
  }
  ids.sort((a, b) => a - b);
  const basisNote = entry.basis === "visual" ? "Judged from official artwork — not the Pokédex color." : "";
  const question: Question = {
    id: entry.id,
    category: "wildcard",
    label: "WILDCARD",
    family: "wildcard",
    prompt: entry.prompt,
    description: [entry.description, basisNote].filter(Boolean).join(" "),
    answers: ids,
    forcedWeak: forcedWeaknesses(ids),
  };
  return {
    entry,
    question,
    unresolved,
    duplicates,
    eligible: entry.status === "approved" && unresolved.length === 0 && ids.length >= MIN_VALID_ANSWERS,
  };
}

export const RESOLVED_WILDCARDS: readonly ResolvedWildcard[] = WILDCARD_ENTRIES.map(resolveWildcard);

/** Wildcard questions for the rotation. `includePending` is for dev previews only. */
export function wildcardQuestions(opts: { includePending?: boolean } = {}): Question[] {
  return RESOLVED_WILDCARDS.filter(
    (w) => w.eligible || (opts.includePending && w.entry.status === "pending" && w.unresolved.length === 0 && w.question.answers.length >= MIN_VALID_ANSWERS),
  ).map((w) => w.question);
}
