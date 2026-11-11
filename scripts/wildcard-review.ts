/**
 * Curated wildcard review (developer tool).
 *
 *   npm run wildcards            # status, counts and problems for every entry
 *   npm run wildcards -- --list  # also print each accepted-answer list
 *
 * To approve a prompt, set "status": "approved" in src/content/wildcards.json
 * after checking its list. Exits 1 if any entry has typos or duplicate names.
 */
import { MIN_VALID_ANSWERS } from "../src/config/game";
import { getSpecies } from "../src/lib/pokedex";
import { difficultyBand } from "../src/lib/questionTraits";
import { RESOLVED_WILDCARDS } from "../src/lib/wildcards";

const LIST = process.argv.includes("--list");
let problems = 0;
const ids = new Set<string>();

for (const w of RESOLVED_WILDCARDS) {
  const e = w.entry;
  const issues: string[] = [];
  if (ids.has(e.id)) issues.push("duplicate id");
  ids.add(e.id);
  if (!e.id.startsWith("wild:")) issues.push('id should start with "wild:"');
  if (!["pending", "approved", "rejected"].includes(e.status)) issues.push(`unknown status "${e.status}"`);
  if (w.unresolved.length) issues.push(`unknown names: ${w.unresolved.join(", ")}`);
  if (w.duplicates.length) issues.push(`listed twice: ${w.duplicates.join(", ")}`);
  if (w.question.answers.length < MIN_VALID_ANSWERS) issues.push(`only ${w.question.answers.length} answers (min ${MIN_VALID_ANSWERS})`);
  if (!e.description) issues.push("no description (players see it as the scope note)");
  problems += issues.filter((i) => /unknown|twice|duplicate id/.test(i)).length;

  const badge = e.status === "approved" ? (w.eligible ? "✅ IN ROTATION" : "⚠️  APPROVED BUT NOT ELIGIBLE") : e.status === "rejected" ? "⛔ REJECTED" : "⏳ PENDING REVIEW";
  console.log(`\n${badge}  ${e.id}  [${e.basis}]`);
  console.log(`  "${e.prompt}"  — ${w.question.answers.length} answers, ${difficultyBand(w.question)}`);
  if (e.description) console.log(`  scope: ${e.description}`);
  if (e.reviewNotes) console.log(`  notes: ${e.reviewNotes}`);
  for (const i of issues) console.log(`  ✗ ${i}`);
  if (LIST) console.log(`  answers: ${w.question.answers.map((id) => getSpecies(id)!.name).join(", ")}`);
}

const approved = RESOLVED_WILDCARDS.filter((w) => w.eligible).length;
console.log(`\n${approved} of ${RESOLVED_WILDCARDS.length} wildcard prompts are in rotation.`);
if (approved < 12) console.log("Tip: about 12+ approved wildcards are needed to reach ~6 per week with the 14-day no-repeat rule.");
process.exit(problems ? 1 : 0);
