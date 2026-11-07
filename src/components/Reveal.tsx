"use client";
import { useEffect, useState } from "react";
import type { Question, Species } from "@/data/types";
import type { AnswerRecord } from "@/lib/session";
import { getTier, topAnswers } from "@/lib/rarity";
import { getSpecies } from "@/lib/pokedex";
import { sfx } from "@/lib/audio";
import { PixelBall } from "@/components/PixelBall";
import { Sprite } from "@/components/Sprite";

/** stage: 0 silhouette → 1 colour → 2 ball wobble → 3 result */
const TIMINGS = { color: 550, ball: 950, result: 2350, fail: 1700 };

function formatShare(share: number) {
  if (share < 0.001) return "<0.1%";
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

export function Reveal({
  record,
  species,
  question,
  isLast,
  onNext,
}: {
  record: AnswerRecord;
  species: Species;
  question: Question;
  isLast: boolean;
  onNext: () => void;
}) {
  const [stage, setStage] = useState(0);
  const tier = record.tier ? getTier(record.tier) : null;

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setTimeout(() => setStage(3), 0);
      return;
    }
    sfx.throwBall();
    const timers = [
      setTimeout(() => setStage(1), TIMINGS.color),
      setTimeout(() => setStage(2), TIMINGS.ball),
    ];
    if (record.correct) {
      [0, 400, 800].forEach((d) => timers.push(setTimeout(sfx.wobble, TIMINGS.ball + 150 + d)));
      timers.push(setTimeout(() => setStage(3), TIMINGS.result));
    } else {
      timers.push(setTimeout(sfx.wobble, TIMINGS.ball + 150));
      timers.push(setTimeout(() => setStage(3), TIMINGS.fail));
    }
    return () => timers.forEach(clearTimeout);
  }, [record]);

  useEffect(() => {
    if (stage !== 3) return;
    if (!record.correct) sfx.brokeFree();
    else if (record.tier === "master") sfx.master();
    else if (record.tier === "ultra") sfx.rare();
    else sfx.caught();
  }, [stage, record]);

  const master = record.tier === "master" && stage === 3;
  const common = !record.correct ? topAnswers(question, 3).map((id) => getSpecies(id)?.name).filter(Boolean) : [];

  return (
    <div className={`reveal ${master ? "reveal--master" : ""}`} onClick={() => stage < 3 && setStage(3)}>
      <div className={`reveal__stage stage-${stage}`}>
        {master && (
          <div className="sparkles" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} style={{ "--i": i } as React.CSSProperties}>
                ✦
              </span>
            ))}
          </div>
        )}
        <div className={`reveal__sprite ${record.correct ? "" : "is-wrong"}`}>
          <Sprite id={record.formId ?? species.id} name={species.name} size={192} />
        </div>
        <div className={`reveal__ball ${record.correct ? "is-catch" : "is-fail"}`}>
          {stage >= 2 && (
            <PixelBall tier={stage === 3 && !record.correct ? "miss" : (record.tier ?? "poke")} size={56} />
          )}
        </div>
      </div>

      <div className="dialog reveal__dialog" aria-live="polite">
        <div className="reveal__name">
          <span className="reveal__dex">#{String(species.id).padStart(4, "0")}</span> {species.name.toUpperCase()}
          {record.formId ? <span className="chip chip--small">REGIONAL FORM</span> : null}
        </div>
        {stage < 3 ? (
          <p className="reveal__line">{record.correct ? "…" : "…"}</p>
        ) : record.correct && tier ? (
          <>
            <div className={`reveal__tier tier--${tier.id}`}>
              <PixelBall tier={tier.id} size={28} />
              <span>{tier.label.toUpperCase()}!</span>
              <span className="reveal__points">+{record.points}</span>
            </div>
            <p className="reveal__line">
              {tier.rarityLabel}. An estimated <strong>{formatShare(record.share)}</strong> of trainers would pick {species.name}.
            </p>
          </>
        ) : (
          <>
            <div className="reveal__tier tier--miss">
              <PixelBall tier="miss" size={28} />
              <span>IT BROKE FREE!</span>
              <span className="reveal__points">+0</span>
            </div>
            <p className="reveal__line">
              {species.name} doesn&apos;t fit this prompt. Popular answers: {common.join(", ")}.
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
