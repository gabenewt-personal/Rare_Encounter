import { describe, expect, it } from "vitest";
import { TIERS } from "@/config/game";
import type { Question } from "@/data/types";
import { QUESTION_POOL } from "@/lib/questions";
import { answerLikelihood, EstimatedRarityProvider, ObservedRarityProvider, scoreAnswer, tierForShare } from "@/lib/rarity";

const ghost = QUESTION_POOL.find((q) => q.id === "type:ghost")!;

describe("tier thresholds", () => {
  it.each([
    [0.5, "poke"],
    [0.2, "poke"],
    [0.1999, "great"],
    [0.05, "great"],
    [0.0499, "ultra"],
    [0.01, "ultra"],
    [0.0099, "master"],
    [0, "master"],
  ])("share %f → %s", (share, tier) => {
    expect(tierForShare(share).id).toBe(tier);
  });

  it("rarer tiers are worth more points", () => {
    const pts = TIERS.map((t) => t.points);
    expect([...pts].sort((a, b) => a - b)).toEqual(pts);
  });
});

describe("EstimatedRarityProvider", () => {
  const provider = new EstimatedRarityProvider();

  it("shares sum to 1 for every question", () => {
    for (const q of QUESTION_POOL.slice(0, 200)) {
      const total = [...provider.shares(q).values()].reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it("is deterministic across instances (same score for every player)", () => {
    const a = new EstimatedRarityProvider().shares(ghost);
    const b = new EstimatedRarityProvider().shares(ghost);
    expect([...a]).toEqual([...b]);
  });

  it("ranks iconic answers as common and obscure ones as rare", () => {
    const gengar = scoreAnswer(ghost, 94, provider);
    const dhelmise = scoreAnswer(ghost, 781, provider);
    expect(gengar.share).toBeGreaterThan(dhelmise.share);
    expect(gengar.points).toBeLessThan(dhelmise.points);
    expect(dhelmise.tier).toBe("master");
  });

  it("gives tied popularity scores equal shares", () => {
    const q: Question = { id: "t", category: "type", label: "", prompt: "", answers: [401, 402, 414, 416] };
    const s = provider.shares(q);
    expect(s.get(402)).toBeCloseTo(s.get(414)!, 12);
  });

  it("scores wrong answers as a 0-point miss", () => {
    expect(scoreAnswer(ghost, 25, provider)).toMatchObject({ correct: false, tier: null, points: 0 });
  });
});

describe("prompt-specific rarity", () => {
  const provider = new EstimatedRarityProvider();
  const q = (id: string) => QUESTION_POOL.find((x) => x.id === id)!;
  const rank = (qid: string, species: number) =>
    [...provider.shares(q(qid))].sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === species) + 1;

  it("relevance hints are subsets of the answers", () => {
    for (const x of QUESTION_POOL) {
      const ans = new Set(x.answers);
      for (const id of [...(x.strong ?? []), ...(x.weak ?? [])]) expect(ans.has(id), x.id).toBe(true);
    }
  });

  it("textbook fits outrank deep cuts for the same prompt", () => {
    // Thunderbolt: Pikachu (Electric, level-up) vs Rattata (TM only, Normal)
    expect(rank("move:thunderbolt", 25)).toBeLessThan(rank("move:thunderbolt", 19));
    expect(provider.shares(q("move:thunderbolt")).get(25)!).toBeGreaterThan(provider.shares(q("move:thunderbolt")).get(19)! * 5);
  });

  it("the same Pokémon has different rarity on different prompts", () => {
    // Gengar: primary Ghost (textbook) but only secondary Poison.
    const asGhost = provider.shares(q("type:ghost")).get(94)!;
    const asPoison = provider.shares(q("type:poison")).get(94)!;
    expect(asGhost).toBeGreaterThan(asPoison);
    // …and the mascot still leads its own type.
    expect(rank("type:electric", 25)).toBe(1);
  });

  it("strong/weak hints move scores in the expected direction", () => {
    expect(answerLikelihood(25, true, false)).toBeGreaterThan(answerLikelihood(25, false, false));
    expect(answerLikelihood(25, false, true)).toBeLessThan(answerLikelihood(25, false, false));
  });

  it("is labelled as an estimate", () => {
    expect(provider.isEstimate).toBe(true);
    expect(provider.label).toBe("Estimated");
  });
});

describe("ObservedRarityProvider (future real data)", () => {
  it("uses real counts when present and falls back to the estimate", () => {
    const counts = new Map([[ghost.answers[ghost.answers.length - 1], 10_000]]);
    const observed = new ObservedRarityProvider((qid) => (qid === ghost.id ? counts : undefined));
    const top = ghost.answers[ghost.answers.length - 1];
    expect(observed.shares(ghost).get(top)!).toBeGreaterThan(0.9);
    const total = [...observed.shares(ghost).values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 9);
    // No counts for this question → identical to the prior.
    const other = QUESTION_POOL[0];
    expect(observed.shares(other).get(other.answers[0])).toBeCloseTo(new EstimatedRarityProvider().shares(other).get(other.answers[0])!, 9);
  });
});
