"use client";
import { useEffect, useState } from "react";
import type { Question, Species } from "@/data/types";
import { outcomeOf, type AnswerRecord } from "@/lib/session";
import { defaultRarityProvider, getTier, topAnswers } from "@/lib/rarity";
import { getSpecies } from "@/lib/pokedex";
import { prefersReducedMotion } from "@/lib/client";
import { sfx } from "@/lib/audio";
import { PixelBall } from "@/components/PixelBall";
import { Sprite } from "@/components/Sprite";

/** stage: 0 silhouette → 1 colour → 2 ball wobble → 3 result */
const TIMINGS = { color: 450, ball: 800, result: 1900, fail: 1400, timeout: 350 };

export function formatShare(share: number) {
  if (share < 0.001) return "<0.1%";
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

/** Counts the points up quickly for rare tiers (instant under reduced motion). */
function usePointsCountUp(target: number, active: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion() || target < 50) {
      const t = setTimeout(() => setV(target), 0);
      return () => clearTimeout(t);
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 450);
      setV(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return v;
}

export function Reveal({
  record,
  species,
  question,
  isLast,
  onNext,
}: {
  record: AnswerRecord;
  species: Species | null;
  question: Question;
  isLast: boolean;
  onNext: () => void;
}) {
  const outcome = outcomeOf(record);
  const [stage, setStage] = useState(0);
  const tier = record.tier ? getTier(record.tier) : null;
  const shown = usePointsCountUp(record.points, stage === 3);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setStage(3), 0);
      return () => clearTimeout(t);
    }
    if (outcome === "timeout") {
      const t = setTimeout(() => setStage(3), TIMINGS.timeout);
      return () => clearTimeout(t);
    }
    sfx.throwBall();
    const timers = [setTimeout(() => setStage(1), TIMINGS.color), setTimeout(() => setStage(2), TIMINGS.ball)];
    if (outcome === "correct") {
      [0, 350, 700].forEach((d) => timers.push(setTimeout(sfx.wobble, TIMINGS.ball + 120 + d)));
      timers.push(setTimeout(() => setStage(3), TIMINGS.result));
    } else {
      timers.push(setTimeout(sfx.wobble, TIMINGS.ball + 120));
      timers.push(setTimeout(() => setStage(3), TIMINGS.fail));
    }
    return () => timers.forEach(clearTimeout);
  }, [outcome]);

  useEffect(() => {
    if (stage !== 3) return;
    if (outcome === "timeout") sfx.timeUp();
    else if (outcome === "incorrect") sfx.brokeFree();
    else if (record.tier === "master") sfx.master();
    else if (record.tier === "ultra") sfx.rare();
    else sfx.caught();
  }, [stage, outcome, record.tier]);

  const fx = stage === 3 && (record.tier === "master" || record.tier === "ultra") ? record.tier : null;
  const common =
    outcome !== "correct"
      ? topAnswers(question, 3)
          .map((id) => getSpecies(id)?.name)
          .filter(Boolean)
      : [];

  return (
    <div className={`reveal ${fx ? `reveal--${fx}` : ""}`} onClick={() => stage < 3 && setStage(3)}>
      <div className={`reveal__stage stage-${stage}`}>
        {fx && (
          <div className={`burst burst--${fx}`} aria-hidden>
            {Array.from({ length: fx === "master" ? 12 : 8 }, (_, i) => (
              <span key={i} style={{ "--i": i, "--n": fx === "master" ? 12 : 8 } as React.CSSProperties} />
            ))}
          </div>
        )}
        {species ? (
          <div className={`reveal__sprite ${outcome === "correct" ? "" : "is-wrong"}`}>
            <Sprite id={record.formId ?? species.id} name={species.name} size={192} />
          </div>
        ) : (
          <div className="reveal__timeout" aria-hidden>
            <span className="reveal__hourglass">⧗</span>
          </div>
        )}
        <div className={`reveal__ball ${outcome === "correct" ? "is-catch" : "is-fail"}`}>
          {species && stage >= 2 && (
            <PixelBall tier={stage === 3 && outcome !== "correct" ? "miss" : (record.tier ?? "poke")} size={56} />
          )}
        </div>
      </div>

      <div className={`dialog reveal__dialog ${fx ? `reveal__dialog--${fx}` : ""}`} aria-live="polite">
        <div className="reveal__name">
          {species ? (
            <>
              <span className="reveal__dex">#{String(species.id).padStart(4, "0")}</span> {species.name.toUpperCase()}
              {record.formId ? <span className="chip chip--small">REGIONAL FORM</span> : null}
            </>
          ) : (
            <span>NO ANSWER</span>
          )}
        </div>
        {stage < 3 ? (
          <p className="reveal__line">…</p>
        ) : outcome === "correct" && tier ? (
          <>
            <div className={`reveal__tier tier--${tier.id}`}>
              <PixelBall tier={tier.id} size={28} />
              <span>{tier.label.toUpperCase()}!</span>
              <span className="reveal__points num">+{shown}</span>
            </div>
            <p className="reveal__line">
              {tier.rarityLabel}. <span className="est">{defaultRarityProvider.isEstimate ? "EST." : ""}</span>{" "}
              <strong>{formatShare(record.share)}</strong> of trainers would pick {species!.name} here.
            </p>
          </>
        ) : outcome === "timeout" ? (
          <>
            <div className="reveal__tier tier--miss">
              <PixelBall tier="miss" size={28} />
              <span>TIME&apos;S UP!</span>
              <span className="reveal__points num">+0</span>
            </div>
            <p className="reveal__line">Popular answers: {common.join(", ")}.</p>
          </>
        ) : (
          <>
            <div className="reveal__tier tier--miss">
              <PixelBall tier="miss" size={28} />
              <span>IT BROKE FREE!</span>
              <span className="reveal__points num">+0</span>
            </div>
            <p className="reveal__line">
              {species!.name} doesn&apos;t fit this prompt. Popular answers: {common.join(", ")}.
            </p>
          </>
        )}
        {stage === 3 && (
          <button className="btn btn--primary reveal__next" onClick={onNext} autoFocus>
            {isLast ? "SEE RESULTS ▶" : "NEXT ▶"}
          </button>
        )}
      </div>
    </div>
  );
}
