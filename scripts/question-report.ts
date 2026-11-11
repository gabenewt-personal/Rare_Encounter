/**
 * Question quality report (developer tool — not part of the game bundle).
 *
 *   npm run report                      # 90 days from today
 *   npm run report -- --days 120 --start 2027-01-01
 *   npm run report -- --preview         # include PENDING wildcards (to review them in context)
 *   npm run report -- --out reports/questions.md
 *
 * For every generated question: category, prompt, valid answers, difficulty,
 * answer-set completeness, similarity to recent questions, and the type
 * distribution of eligible Pokémon. Flags problems; exits 1 on hard failures.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATEGORY_CONFIG, DIFFICULTY_BANDS, MIN_VALID_ANSWERS, TEAM_SYNERGY, WEEKLY_GROUP_QUOTA } from "../src/config/game";
import type { Question } from "../src/data/types";
import { addDays, dateKeyFor } from "../src/lib/dates";
import { ALL_SPECIES, answerTypes, getSpecies } from "../src/lib/pokedex";
import { generateDailyChallenge } from "../src/lib/questions";
import { difficultyBand, effectiveAnswerCount, familyOf } from "../src/lib/questionTraits";
import { bestTeamExposure } from "../src/lib/teamSearch";
import { RESOLVED_WILDCARDS } from "../src/lib/wildcards";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const DAYS = Number(arg("days", "90"));
const START = arg("start", dateKeyFor())!;
const PREVIEW = process.argv.includes("--preview");
const OUT = arg("out");

const VAGUE = /\b(about|around|roughly|big|small|large|tiny|colorful|often|usually|kind of|sort of|similar|mostly)\b/i;
const GOOD_EXPOSURE = TEAM_SYNERGY.tiers.find((t) => t.id === "good")!.maxExposure;

interface Row {
  date: string;
  slot: number;
  q: Question;
  group: string;
  band: string;
  raw: number;
  effective: number;
  completeness: string;
  similarity: number;
  similarTo: string;
  types: string;
  flags: string[];
}

const jaccard = (a: readonly number[], b: readonly number[]) => {
  const A = new Set(a);
  const inter = b.filter((x) => A.has(x)).length;
  return inter / (A.size + b.length - inter || 1);
};

function typeDistribution(q: Question): string {
  const counts = new Map<string, number>();
  for (const id of q.answers) for (const t of answerTypes(id, q.forms?.[id])) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${t} ${Math.round((n / q.answers.length) * 100)}%`)
    .join(", ");
}

function completeness(q: Question): string {
  const ids = new Set(ALL_SPECIES.map((s) => s.id));
  if (!q.answers.length) return "EMPTY";
  if (q.answers.some((id) => !ids.has(id))) return "BAD IDS";
  if (new Set(q.answers).size !== q.answers.length) return "DUPLICATES";
  if (q.category === "wildcard") {
    const w = RESOLVED_WILDCARDS.find((x) => x.entry.id === q.id);
    if (w?.unresolved.length) return `UNRESOLVED: ${w.unresolved.join(", ")}`;
    return `curated (${w?.entry.status})`;
  }
  return "generated ✓";
}

const rows: Row[] = [];
const dayFlags: { date: string; flags: string[] }[] = [];
const history: { date: string; q: Question }[] = [];

for (let i = 0; i < DAYS; i++) {
  const date = addDays(START, i);
  const c = generateDailyChallenge(date, { includePendingWildcards: PREVIEW });
  const flagsToday: string[] = [];

  // Team-composition check for the whole day.
  const best = bestTeamExposure(c.questions);
  if (best > GOOD_EXPOSURE) flagsToday.push(`TEAM-CONSTRAINED (best exposure ${best})`);
  const forced = new Map<string, number>();
  for (const q of c.questions) for (const t of q.forcedWeak ?? []) forced.set(t, (forced.get(t) ?? 0) + 1);
  for (const [t, n] of forced) if (n >= 3) flagsToday.push(`SHARED-WEAKNESS ${t}×${n}`);
  const cats = new Map<string, number>();
  for (const q of c.questions) cats.set(q.category, (cats.get(q.category) ?? 0) + 1);
  for (const [cat, n] of cats) if (n > 2) flagsToday.push(`CATEGORY-REPEAT ${cat}×${n}`);
  if (flagsToday.length) dayFlags.push({ date, flags: flagsToday });

  c.questions.forEach((q, slot) => {
    const recent = history.filter((h) => h.date >= addDays(date, -7));
    let similarity = 0;
    let similarTo = "";
    for (const h of recent) {
      const s = h.q.id === q.id ? 1 : jaccard(q.answers, h.q.answers);
      if (s > similarity) [similarity, similarTo] = [s, `${h.q.id} (${h.date})`];
    }
    const flags: string[] = [];
    if (q.answers.length < MIN_VALID_ANSWERS) flags.push("TOO-FEW-ANSWERS");
    if (similarity >= 0.6) flags.push("SIMILAR-TO-RECENT");
    const fam = familyOf(q);
    const usedOn = (d: string) => history.some((h) => h.date === d && familyOf(h.q) === fam);
    // Core has only six broad families for ~3.5 slots/day, so judge it by category streaks instead.
    if (CATEGORY_CONFIG[q.category].group !== "core" && usedOn(addDays(date, -1)) && usedOn(addDays(date, -2))) flags.push("FAMILY-3-DAYS-RUNNING");
    const catOn = (d: string) => history.some((h) => h.date === d && h.q.category === q.category);
    if ([1, 2, 3, 4].every((k) => catOn(addDays(date, -k)))) flags.push("CATEGORY-5-DAY-STREAK");
    if (VAGUE.test(q.prompt) && !q.description) flags.push("POSSIBLY-AMBIGUOUS");
    if (["move", "location"].includes(q.category) && !q.description) flags.push("MISSING-SCOPE");
    if (q.category === "wildcard") {
      const w = RESOLVED_WILDCARDS.find((x) => x.entry.id === q.id);
      if (w?.entry.status !== "approved") flags.push("UNREVIEWED-WILDCARD");
    }
    const comp = completeness(q);
    if (!/✓|approved|pending/.test(comp)) flags.push("INCOMPLETE-ANSWER-SET");
    rows.push({
      date,
      slot,
      q,
      group: CATEGORY_CONFIG[q.category].group,
      band: DIFFICULTY_BANDS[difficultyBand(q)].label,
      raw: q.answers.length,
      effective: Math.round(effectiveAnswerCount(q)),
      completeness: comp,
      similarity: Math.round(similarity * 100) / 100,
      similarTo,
      types: typeDistribution(q),
      flags,
    });
  });
  for (const q of c.questions) history.push({ date, q });
}

/* ---------------- Summary ---------------- */
const groupCounts: Record<string, number> = {};
const catCounts: Record<string, number> = {};
const genAnswers: Record<number, number> = {};
for (const r of rows) {
  groupCounts[r.group] = (groupCounts[r.group] ?? 0) + 1;
  catCounts[r.q.category] = (catCounts[r.q.category] ?? 0) + 1;
  for (const id of r.q.answers) {
    const g = getSpecies(id)!.gen;
    genAnswers[g] = (genAnswers[g] ?? 0) + 1;
  }
}
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const weeks = rows.length / 42;
const lines: string[] = [];
lines.push(`# Question quality report — ${DAYS} days from ${START}${PREVIEW ? " (PREVIEW: pending wildcards included)" : ""}\n`);
lines.push(`## Rotation mix (per 42-prompt week, target ${WEEKLY_GROUP_QUOTA.core}/${WEEKLY_GROUP_QUOTA.trivia}/${WEEKLY_GROUP_QUOTA.wildcard})`);
for (const g of ["core", "trivia", "wildcard"]) lines.push(`- ${g}: ${((groupCounts[g] ?? 0) / weeks).toFixed(1)} per week (${pct(groupCounts[g] ?? 0, rows.length)})`);
lines.push(`\n## Categories\n${Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `- ${c}: ${n} (${pct(n, rows.length)})`).join("\n")}`);
const totalAnswers = Object.values(genAnswers).reduce((a, b) => a + b, 0);
lines.push(`\n## Eligible answers by generation\n${Object.entries(genAnswers).map(([g, n]) => `Gen ${g}: ${pct(n, totalAnswers)}`).join(" · ")}`);
const bandCounts = rows.reduce<Record<string, number>>((m, r) => ((m[r.band] = (m[r.band] ?? 0) + 1), m), {});
lines.push(`\n## Difficulty\n${Object.entries(bandCounts).map(([b, n]) => `${b}: ${n}`).join(" · ")}`);

lines.push(`\n## Curated wildcards`);
for (const w of RESOLVED_WILDCARDS) {
  lines.push(`- ${w.entry.status === "approved" ? "✅" : "⏳"} ${w.entry.id} — ${w.entry.status.toUpperCase()}, ${w.question.answers.length} answers${w.unresolved.length ? `, UNRESOLVED: ${w.unresolved.join(", ")}` : ""}${w.duplicates.length ? `, duplicates: ${w.duplicates.join(", ")}` : ""}`);
}

const flagged = rows.filter((r) => r.flags.length);
lines.push(`\n## Flags\n- Questions flagged: ${flagged.length} / ${rows.length}\n- Days flagged: ${dayFlags.length} / ${DAYS}`);
for (const d of dayFlags) lines.push(`- ${d.date}: ${d.flags.join("; ")}`);
const flagTotals = flagged.flatMap((r) => r.flags).reduce<Record<string, number>>((m, f) => ((m[f] = (m[f] ?? 0) + 1), m), {});
for (const [f, n] of Object.entries(flagTotals)) lines.push(`- ${f}: ${n}`);

lines.push(`\n## All questions\n| Date | # | Group | Category | Prompt | Valid | Eff. | Difficulty | Answer set | Similarity (7d) | Top answer types | Flags |\n|---|---|---|---|---|---|---|---|---|---|---|---|`);
for (const r of rows) {
  lines.push(`| ${r.date} | ${r.slot + 1} | ${r.group} | ${r.q.category} | ${r.q.prompt} | ${r.raw} | ${r.effective} | ${r.band} | ${r.completeness} | ${r.similarity}${r.similarTo ? ` vs ${r.similarTo}` : ""} | ${r.types} | ${r.flags.join(", ")} |`);
}

const text = lines.join("\n");
if (OUT) {
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`Wrote ${OUT}`);
}
// Console: everything except the big table.
console.log(text.split("\n## All questions")[0]);
const hardFailures = rows.filter((r) => r.flags.some((f) => f === "TOO-FEW-ANSWERS" || f === "INCOMPLETE-ANSWER-SET")).length;
process.exit(hardFailures ? 1 : 0);
