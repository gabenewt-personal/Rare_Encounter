"use client";
import { useEffect, useState } from "react";
import { QUESTION_POOL, type DailyChallenge } from "@/lib/questions";
import type { DailySession } from "@/lib/session";
import { bestAnswer, rarestAnswer, totalScore, MAX_SCORE_PER_QUESTION } from "@/lib/session";
import type { PlayerProgress, TrainerClassInfo } from "@/lib/progress/streak";
import { getSpecies } from "@/lib/pokedex";
import { getTier } from "@/lib/rarity";
import { buildShareText } from "@/lib/share";
import { formatCountdown, msUntilReset } from "@/lib/dates";
import { sfx } from "@/lib/audio";
import { PixelBall } from "@/components/PixelBall";
import { Sprite } from "@/components/Sprite";
import { TrainerCard } from "@/components/TrainerCard";

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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

function useCountdown(isDev: boolean) {
  const [ms, setMs] = useState(() => msUntilReset());
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilReset()), 1000);
    return () => clearInterval(t);
  }, []);
  return isDev ? null : ms;
}

export function Results({
  challenge,
  session,
  trainer,
  progress,
  isDev,
}: {
  challenge: DailyChallenge;
  session: DailySession;
  trainer: TrainerClassInfo;
  progress: PlayerProgress;
  isDev: boolean;
}) {
  const total = totalScore(session);
  const shown = useCountUp(total);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const countdown = useCountdown(isDev);
  const best = bestAnswer(session);
  const rarest = rarestAnswer(session);
  const max = MAX_SCORE_PER_QUESTION * challenge.questions.length;
  const pastScores = Object.values(progress.history).filter((h) => h.date !== session.date).map((h) => h.score);
  const personalBest = pastScores.length > 0 && total > Math.max(...pastScores);

  useEffect(() => {
    const t = setTimeout(sfx.victory, 250);
    return () => clearTimeout(t);
  }, []);

  const share = async () => {
    const text = buildShareText(session, challenge.number, trainer, typeof window !== "undefined" ? window.location.origin : undefined);
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
          DAILY #{challenge.number} · {challenge.date}
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
          const sp = getSpecies(a.speciesId)!;
          const q = QUESTION_POOL.find((x) => x.id === a.questionId) ?? challenge.questions[i];
          return (
            <li key={a.questionId} className={`results__row ${a.correct ? "" : "is-miss"}`}>
              <span className="results__sprite">
                <Sprite id={a.formId ?? sp.id} name={sp.name} size={48} />
              </span>
              <span className="results__info">
                <span className="results__name">{sp.name}</span>
                <span className="results__prompt">{q?.prompt}</span>
              </span>
              <PixelBall tier={a.tier ?? "miss"} size={22} title={a.tier ? getTier(a.tier).label : "Missed"} />
              <span className="results__pts num">{a.points}</span>
            </li>
          );
        })}
      </ol>

      <div className="results__highlights">
        <div className="dialog dialog--tight">
          <div className="label">BEST ANSWER</div>
          <div className="results__hl">{best ? `${getSpecies(best.speciesId)!.name} · ${best.points} PTS` : "—"}</div>
        </div>
        <div className="dialog dialog--tight">
          <div className="label">RAREST ANSWER</div>
          <div className="results__hl">
            {rarest ? `${getSpecies(rarest.speciesId)!.name} · ${(rarest.share * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      <TrainerCard info={trainer} best={progress.bestStreak} />

      <button className="btn btn--primary btn--wide" onClick={share}>
        {copied === "ok" ? "COPIED TO CLIPBOARD!" : copied === "fail" ? "COPY FAILED" : "SHARE RESULTS"}
      </button>

      <div className="results__footer label">
        {countdown !== null ? (
          <>NEXT ENCOUNTER IN <span className="num">{formatCountdown(countdown)}</span></>
        ) : (
          <>DEV MODE · USE THE DEV PANEL TO CHANGE DAYS</>
        )}
      </div>
      <p className="fineprint">Rarity values are estimates from a popularity model, not real player submissions (yet).</p>
    </div>
  );
}
