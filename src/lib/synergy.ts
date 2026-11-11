/**
 * Team Synergy: defensive type analysis of a six-Pokémon party.
 *
 * Pure and data-driven: the type chart comes from PokéAPI (current
 * generation) and every threshold lives in TEAM_SYNERGY, so balancing never
 * touches this file. Abilities, items, moves and battle-only forms are ignored.
 *
 * For each of the 18 attacking types:
 *   weak     = teammates taking > 1× (a 4× weakness counts quadWeaknessWeight)
 *   covered  = teammates taking < 1× (resist or immune)
 *   exposure = max(0, weak − covered − overlapAllowance)
 * Team exposure = Σ exposure; it picks the multiplier tier.
 */
import typeChartFile from "@/data/generated/typechart.json";
import { TEAM_SIZE, TEAM_SYNERGY, type SynergyTierId } from "@/config/game";
import type { PokemonType, TypeChartFile } from "@/data/types";

const typeChart = typeChartFile as TypeChartFile;
export const ALL_TYPES: readonly PokemonType[] = typeChart.types;

export type SynergyConfig = typeof TEAM_SYNERGY;

/** Damage multiplier of an attacking type against a (possibly dual) typing. */
export function defensiveMultiplier(attacker: PokemonType, defender: readonly PokemonType[]): number {
  return defender.reduce((m, d) => m * (typeChart.chart[attacker]?.[d] ?? 1), 1);
}

export interface TypeMatchup {
  attacker: PokemonType;
  /** Weighted count of weak teammates (4× may count extra). */
  weak: number;
  weakMembers: number;
  quadMembers: number;
  resistMembers: number;
  immuneMembers: number;
  exposure: number;
}

export interface TeamAnalysis {
  matchups: TypeMatchup[];
  exposure: number;
  tier: { id: SynergyTierId; label: string; multiplier: number };
  /** Attacking types the team struggles with most (exposure first, then net weakness). */
  vulnerabilities: TypeMatchup[];
  /** Attacking types the team handles best (most resist/immune, nobody weak). */
  strengths: TypeMatchup[];
}

export function tierForExposure(exposure: number, cfg: SynergyConfig = TEAM_SYNERGY) {
  const t = cfg.tiers.find((x) => exposure <= x.maxExposure) ?? cfg.tiers[cfg.tiers.length - 1];
  return { id: t.id, label: t.label, multiplier: t.multiplier };
}

export function analyzeTeam(team: readonly (readonly PokemonType[])[], cfg: SynergyConfig = TEAM_SYNERGY): TeamAnalysis {
  const matchups: TypeMatchup[] = ALL_TYPES.map((attacker) => {
    let weak = 0;
    let weakMembers = 0;
    let quadMembers = 0;
    let resistMembers = 0;
    let immuneMembers = 0;
    for (const types of team) {
      const m = defensiveMultiplier(attacker, types);
      if (m > 1) {
        weakMembers++;
        if (m >= 4) quadMembers++;
        weak += m >= 4 ? cfg.quadWeaknessWeight : 1;
      } else if (m === 0) immuneMembers++;
      else if (m < 1) resistMembers++;
    }
    const exposure = Math.max(0, weak - (resistMembers + immuneMembers) - cfg.overlapAllowance);
    return { attacker, weak, weakMembers, quadMembers, resistMembers, immuneMembers, exposure };
  });
  const exposure = matchups.reduce((s, m) => s + m.exposure, 0);
  const net = (m: TypeMatchup) => m.weak - m.resistMembers - m.immuneMembers;
  const vulnerabilities = matchups
    .filter((m) => net(m) > 0)
    .sort((a, b) => b.exposure - a.exposure || net(b) - net(a) || b.quadMembers - a.quadMembers);
  const strengths = matchups
    .filter((m) => m.weakMembers === 0 && m.resistMembers + m.immuneMembers > 0)
    .sort((a, b) => b.resistMembers + b.immuneMembers - (a.resistMembers + a.immuneMembers));
  return { matchups, exposure, tier: tierForExposure(exposure, cfg), vulnerabilities, strengths };
}

/** Synergy applies only to a full party of valid, distinct Pokémon. */
export function isFullValidTeam(speciesIds: readonly (number | null)[]): boolean {
  const ids = speciesIds.filter((x): x is number => x != null);
  return speciesIds.length === TEAM_SIZE && ids.length === TEAM_SIZE && new Set(ids).size === TEAM_SIZE;
}

/** Rarity score × synergy multiplier, rounded. Rarity stays the main source of points. */
export function applyMultiplier(base: number, multiplier: number): number {
  return Math.round(base * multiplier);
}
