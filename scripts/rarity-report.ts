/** Prints the estimated rarity distribution for a few questions: npx tsx scripts/rarity-report.ts [questionId...] */
import { QUESTION_POOL, generateDailyChallenge } from "../src/lib/questions";
import { defaultRarityProvider, tierForShare } from "../src/lib/rarity";
import { getSpecies } from "../src/lib/pokedex";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["type:ghost", "dual:water-ground", "move:tackle", "evo:item-moon-stone", "gen:3", "ability:levitate"];
for (const id of ids) {
  const q = QUESTION_POOL.find((x) => x.id === id)!;
  const shares = [...defaultRarityProvider.shares(q)].sort((a, b) => b[1] - a[1]);
  const counts: Record<string, number> = {};
  for (const [, s] of shares) counts[tierForShare(s).id] = (counts[tierForShare(s).id] ?? 0) + 1;
  console.log(`\n${q.prompt} (${q.answers.length})`, counts);
  console.log("  " + shares.slice(0, 6).map(([sid, s]) => `${getSpecies(sid)!.name} ${(s * 100).toFixed(1)}%`).join(", "));
}
// tier mix across 60 days of real challenges
const mix: Record<string, number> = {};
for (let d = 0; d < 60; d++) {
  const date = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
  for (const q of generateDailyChallenge(date).questions) {
    for (const [, s] of defaultRarityProvider.shares(q)) mix[tierForShare(s).id] = (mix[tierForShare(s).id] ?? 0) + 1;
  }
}
console.log("\nAnswer-tier mix over 60 days:", mix);
