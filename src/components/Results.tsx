"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getQuestion, type DailyChallenge } from "@/lib/questions";
import type { DailySession } from "@/lib/session";
import { bestAnswer, MAX_SCORE_PER_QUESTION, outcomeOf, rarestAnswer, totalScore } from "@/lib/session";
import type { PlayerProgress, TrainerClassInfo } from "@/lib/progress/streak";
import { getSpecies } from "@/lib/pokedex";
import { defaultRarityProvider, getTier } from "@/lib/rarity";
import { buildShareText } from "@/lib/share";
import { prefersReducedMotion } from "@/lib/client";
import { sfx } from "@/lib/audio";
import { PixelBall } from "@/components/PixelBall";
import { ResetInfo } from "@/components/ResetInfo";
import { formatShare } from "@/components/Reveal";
import { Sprite } from "@/components/Sprite";
import { TrainerCard } from "@/components/TrainerCard";

function useCountUp(target: number, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - start) / duration);
      setValue(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

const nameOf = (id: number | null) => (id == null ? "—" : (getSpecies(id)?.name ?? "?"));

export function Results({
  challenge,
  session,
  trainer,
  progress,
  isDev,
  homeHref,
}: {
  challenge: DailyChallenge;
  session: DailySession;
  trainer: TrainerClassInfo;
  progress: PlayerProgress;
  isDev: boolean;
  homeHref: string;
}) {
  const total = totalScore(session);
  const shown = useCountUp(total);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const best = bestAnswer(session);
  const rarest = rarestAnswer(session);
  const max = MAX_SCORE_PER_QUESTION * challenge.questions.length;
  const pastScores = Object.values(progress.history)
    .filter((h) => h.date !== session.date)
    .map((h) => h.score);
  const personalBest = pastScores.length > 0 && total > Math.max(...pastScores);

  useEffect(() => {
    const t = setTimeout(sfx.victory, 250);
    return () => clearTimeout(t);
  }, []);

  const share = async () => {
    const text = buildShareText(session, challenge.number, trainer, window.location.origin);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      // Older iOS / insecure contexts: fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      setCopied(ok ? "ok" : "fail");
    }
    sfx.select();
    setTimeout(() => setCopied("idle"), 2200);
  };

  return (
    <div className="results">
      <div className="results__banner">
        <div className="results__title blink-slow">CHALLENGE CLEAR!</div>
        <div className="label">
          DAILY #{challenge.number} · {challenge.date} UTC
        </div>
      </div>

      <div className="scoreboard" aria-label={`Total score ${total} of ${max}`}>
        <div className="label">TOTAL SCORE</div>
        <div className="scoreboard__value num">{String(shown).padStart(3, "0")}</div>
        <div className="label">OF {max}</div>
        {personalBest && <div className="chip chip--gold blink-slow">NEW PERSONAL BEST!</div>}
      </div>

      <ol className="dialog results__list">
        {session.answers.map((a, i) => {
          const sp = a.speciesId != null ? getSpecies(a.speciesId) : undefined;
          const q = getQuestion(a.questionId) ?? challenge.questions[i];
          const out = outcomeOf(a);
          return (
            <li key={a.questionId} className={`results__row ${out === "correct" ? "" : "is-miss"}`}>
              <span className="results__sprite">
                {sp ? <Sprite id={a.formId ?? sp.id} name={sp.name} size={48} /> : <span className="results__hourglass">⧗</span>}
              </span>
              <span className="results__info">
                <span className="results__name">{sp ? sp.name : "Time's up"}</span>
                <span className="results__prompt">{q?.prompt}</span>
              </span>
              <PixelBall tier={a.tier ?? "miss"} size={22} title={a.tier ? getTier(a.tier).label : out === "timeout" ? "Timed out" : "Missed"} />
              <span className="results__pts num">{a.points}</span>
            </li>
          );
        })}
      </ol>

      <div className="results__highlights">
        <div className="dialog dialog--tight">
          <div className="label">BEST ANSWER</div>
          <div className="results__hl">{best ? `${nameOf(best.speciesId)} · ${best.points} PTS` : "—"}</div>
        </div>
        <div className="dialog dialog--tight">
          <div className="label">RAREST ANSWER</div>
          <div className="results__hl">{rarest ? `${nameOf(rarest.speciesId)} · ${formatShare(rarest.share)}` : "—"}</div>
        </div>
      </div>

      <TrainerCard info={trainer} best={progress.bestStreak} />

      <ResetInfo isDev={isDev} />
      <p className="fineprint">
        {defaultRarityProvider.isEstimate
          ? "Rarity percentages are ESTIMATES from a prompt-specific popularity model — not real player submissions (yet)."
          : "Rarity percentages come from real player submissions."}
      </p>

      <div className="results__actions">
        <Link href={homeHref} className="btn btn--primary btn--wide">
          ◀ RETURN HOME
        </Link>
        <button className="btn btn--wide" onClick={share}>
          {copied === "ok" ? "COPIED TO CLIPBOARD!" : copied === "fail" ? "COPY FAILED" : "SHARE RESULTS"}
        </button>
      </div>
    </div>
  );
}
