/**
 * Best achievable Team Synergy for a set of prompts (one distinct Pokémon per
 * prompt). Used by tests and balance tooling to guarantee no day *forces* a
 * poor party. Beam search over distinct typings keeps it fast.
 */
import type { PokemonType, Question } from "@/data/types";
import { answerTypes } from "@/lib/pokedex";
import { analyzeTeam } from "@/lib/synergy";

interface Partial {
  types: PokemonType[][];
  ids: number[];
  used: Set<number>;
  score: number;
}

export function bestTeamExposure(questions: readonly Question[], beamWidth = 60): number {
  return bestTeam(questions, beamWidth).exposure;
}

/** Lowest-exposure party found (one species id per prompt, in order). */
export function bestTeam(questions: readonly Question[], beamWidth = 60): { exposure: number; ids: number[] } {
  let beam: Partial[] = [{ types: [], ids: [], used: new Set(), score: 0 }];
  for (const q of questions) {
    // One representative species per distinct typing keeps branching small.
    const options = new Map<string, { id: number; types: PokemonType[] }[]>();
    for (const id of q.answers) {
      const types = answerTypes(id, q.forms?.[id]);
      const key = [...types].sort().join("/");
      const arr = options.get(key) ?? [];
      if (arr.length < 7) arr.push({ id, types });
      options.set(key, arr);
    }
    const next: Partial[] = [];
    for (const p of beam) {
      for (const reps of options.values()) {
        const pick = reps.find((r) => !p.used.has(r.id));
        if (!pick) continue;
        const types = [...p.types, pick.types];
        next.push({ types, ids: [...p.ids, pick.id], used: new Set([...p.used, pick.id]), score: analyzeTeam(types).exposure });
      }
    }
    // Deduplicate by multiset of typings, keep the lowest-exposure partial teams.
    const seen = new Set<string>();
    beam = next
      .sort((a, b) => a.score - b.score)
      .filter((p) => {
        const k = p.types.map((t) => [...t].sort().join("/")).sort().join("|");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, beamWidth);
  }
  const best = beam.reduce((a, b) => (b.score < a.score ? b : a));
  return { exposure: best.score, ids: best.ids };
}
