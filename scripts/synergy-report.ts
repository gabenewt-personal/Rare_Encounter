/**
 * Team Synergy balance report: how exposure totals and multiplier tiers fall
 * out for simulated players over a year of real daily challenges.
 *
 *   npx tsx scripts/synergy-report.ts [days=365]
 */
import { TEAM_SYNERGY } from "../src/config/game";
import { addDays } from "../src/lib/dates";
import { ALL_SPECIES, answerTypes } from "../src/lib/pokedex";
import { generateDailyChallenge } from "../src/lib/questions";
import { createRng, shuffle } from "../src/lib/random";
import { defaultRarityProvider } from "../src/lib/rarity";
import { analyzeTeam } from "../src/lib/synergy";
import { bestTeamExposure } from "../src/lib/teamSearch";
import type { PokemonType, Question } from "../src/data/types";

const DAYS = Number(process.argv[2] ?? 365);
// Experiment without editing config: ALLOWANCE=1 QUAD=2 TIERS=0,2,5 npx tsx scripts/synergy-report.ts
if (process.env.ALLOWANCE) TEAM_SYNERGY.overlapAllowance = Number(process.env.ALLOWANCE);
if (process.env.QUAD) TEAM_SYNERGY.quadWeaknessWeight = Number(process.env.QUAD);
if (process.env.TIERS) process.env.TIERS.split(",").forEach((v, i) => (TEAM_SYNERGY.tiers[i].maxExposure = Number(v)));
const rng = createRng("synergy-report");

type Team = PokemonType[][];
const typesFor = (q: Question, id: number) => answerTypes(id, q.forms?.[id]);

function pickDistinct(qs: Question[], choose: (q: Question, used: Set<number>) => number): Team {
  const used = new Set<number>();
  return qs.map((q) => {
    const id = choose(q, used);
    used.add(id);
    return typesFor(q, id);
  });
}

const popular = (q: Question, used: Set<number>) => {
  const shares = [...defaultRarityProvider.shares(q)].filter(([id]) => !used.has(id));
  const total = shares.reduce((s, [, v]) => s + v, 0);
  let r = rng() * total;
  for (const [id, v] of shares) if ((r -= v) < 0) return id;
  return shares[shares.length - 1][0];
};
const uniform = (q: Question, used: Set<number>) => shuffle(q.answers.filter((a) => !used.has(a)), rng)[0];

const buckets: Record<string, number[]> = { "random dex": [], popular: [], "rarity hunter": [], "best possible": [] };
for (let i = 0; i < DAYS; i++) {
  const qs = generateDailyChallenge(addDays("2026-11-10", i)).questions;
  buckets.popular.push(analyzeTeam(pickDistinct(qs, popular)).exposure);
  buckets["rarity hunter"].push(analyzeTeam(pickDistinct(qs, uniform)).exposure);
  buckets["best possible"].push(bestTeamExposure(qs));
  buckets["random dex"].push(analyzeTeam(shuffle(ALL_SPECIES, rng).slice(0, 6).map((s) => s.types)).exposure);
}

console.log(`Allowance ${TEAM_SYNERGY.overlapAllowance}, tiers ${TEAM_SYNERGY.tiers.map((t) => `${t.id}≤${t.maxExposure}`).join(" ")}\n`);
for (const [name, xs] of Object.entries(buckets)) {
  const tiers: Record<string, number> = {};
  for (const x of xs) {
    const t = TEAM_SYNERGY.tiers.find((t) => x <= t.maxExposure)!.id;
    tiers[t] = (tiers[t] ?? 0) + 1;
  }
  const pct = (n = 0) => `${Math.round((n / xs.length) * 100)}%`.padStart(4);
  const sorted = [...xs].sort((a, b) => a - b);
  console.log(
    `${name.padEnd(14)} excellent ${pct(tiers.excellent)}  good ${pct(tiers.good)}  fair ${pct(tiers.fair)}  poor ${pct(tiers.poor)}   median ${sorted[Math.floor(xs.length / 2)]}  max ${sorted[xs.length - 1]}`,
  );
}
