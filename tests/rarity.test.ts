import { describe, expect, it } from "vitest";
import { TIERS } from "@/config/game";
import type { Question } from "@/data/types";
import { QUESTION_POOL } from "@/lib/questions";
import { EstimatedRarityProvider, ObservedRarityProvider, scoreAnswer, tierForShare } from "@/lib/rarity";

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
