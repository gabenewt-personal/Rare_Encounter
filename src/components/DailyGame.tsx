"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateLabel } from "@/lib/dates";
import { appHref, prefersReducedMotion, readClientContext } from "@/lib/client";
import { generateDailyChallenge, difficultyOf } from "@/lib/questions";
import { activeStreak, trainerClassFor, type PlayerProgress } from "@/lib/progress/streak";
import {
  applyAnswer,
  applyTimeout,
  isTimerRunning,
  loadOrCreateSession,
  persistSession,
  startTimer,
  timeLeft,
  totalScore,
  usedSpeciesIds,
  type DailySession,
} from "@/lib/session";
import { displaySeconds, isUrgent } from "@/lib/timer";
import { validateAnswer } from "@/lib/validation";
import { getSpecies } from "@/lib/pokedex";
import { sfx } from "@/lib/audio";
import { AnswerInput } from "@/components/AnswerInput";
import { DevPanel } from "@/components/DevPanel";
import { PartyBar } from "@/components/PartyBar";
import { PixelWipe } from "@/components/PixelWipe";
import { QuestionTimer } from "@/components/QuestionTimer";
import { Results } from "@/components/Results";
import { Reveal } from "@/components/Reveal";
import { Shell } from "@/components/Shell";
import { Typewriter } from "@/components/Typewriter";

type Phase = "question" | "reveal" | "results";

function initDaily() {
  const ctx = readClientContext();
  const challenge = generateDailyChallenge(ctx.date, { includePendingWildcards: ctx.previewWildcards });
  let session = loadOrCreateSession(ctx.store, challenge);
  let notice: string | null = null;
  // A timer that ran out while the page was closed/backgrounded resolves now.
  const timedOut = applyTimeout(session, challenge, Date.now());
  if (timedOut !== session) {
    notice = `Time ran out on prompt ${timedOut.answers.length} while you were away.`;
    session = timedOut;
  }
  // Heals a completed session whose progress write was interrupted (idempotent).
  const progress = persistSession(ctx.store, session);
  return { ctx, challenge, session, progress, notice };
}

export default function DailyGame() {
  const [init] = useState(initDaily);
  const { ctx, challenge } = init;
  const [session, setSession] = useState<DailySession>(init.session);
  const [progress, setProgress] = useState<PlayerProgress>(init.progress);
  const [phase, setPhase] = useState<Phase>(init.session.completed ? "results" : "question");
  const [wipe, setWipe] = useState<"in" | "out" | null>(null);
  const [message, setMessage] = useState<string | null>(init.notice);
  const [now, setNow] = useState(() => Date.now());
  const shakeRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  const phaseRef = useRef(phase);
  useEffect(() => {
    sessionRef.current = session;
    phaseRef.current = phase;
  });

  const streak = activeStreak(progress, ctx.date);
  const trainer = trainerClassFor(streak);
  const qIndex = phase === "reveal" ? session.answers.length - 1 : session.answers.length;
  const question = challenge.questions[Math.min(qIndex, challenge.questions.length - 1)];
  const usedIds = useMemo(() => new Set(usedSpeciesIds(session)), [session]);
  const lastRecord = session.answers[session.answers.length - 1];
  const running = phase === "question" && isTimerRunning(session);
  const remaining = timeLeft(session, now);

  const commit = useCallback(
    (next: DailySession) => {
      // Persist before any animation so a reload can't replay a turn.
      const p = persistSession(ctx.store, next);
      sessionRef.current = next;
      setSession(next);
      setProgress(p);
    },
    [ctx.store],
  );

  // Wall-clock ticker for the running timer. Also handles timeouts, including
  // after the tab was backgrounded (the interval resumes; the clock is truth).
  useEffect(() => {
    if (!running) return;
    let lastSecond = -1;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const s = sessionRef.current;
      if (phaseRef.current !== "question") return;
      const left = timeLeft(s, t);
      const sec = displaySeconds(left);
      if (isUrgent(left) && sec !== lastSecond) sfx.tick();
      lastSecond = sec;
      if (left <= 0) {
        const next = applyTimeout(s, challenge, t);
        if (next !== s) {
          commit(next);
          setMessage(null);
          phaseRef.current = "reveal";
          setPhase("reveal");
        }
      }
    };
    tick();
    const id = setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running, challenge, commit]);

  /** Prompt fully shown + input ready → start (or keep) this prompt's timer. */
  const onPromptShown = useCallback(() => {
    const s = sessionRef.current;
    if (phaseRef.current !== "question" || isTimerRunning(s) || s.completed) return;
    const t = Date.now();
    commit(startTimer(s, t));
    setNow(t);
  }, [commit]);

  const transitionTo = (next: Phase) => {
    if (prefersReducedMotion()) return setPhase(next);
    setWipe("in");
    setTimeout(() => {
      setPhase(next);
      setWipe("out");
      setTimeout(() => setWipe(null), 420);
    }, 420);
  };

  const shake = () => {
    const el = shakeRef.current;
    if (!el || prefersReducedMotion()) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  };

  const submit = (input: string) => {
    if (phase !== "question" || !running) return;
    const result = validateAnswer(input, question, usedIds);
    if (result.kind === "empty") return;
    if (result.kind === "unknown") {
      sfx.error();
      shake();
      setMessage(`"${input.trim().slice(0, 24)}" isn't in the Pokédex. Try again!`);
      return;
    }
    if (result.kind === "duplicate") {
      sfx.error();
      shake();
      setMessage(`You already used ${result.species.name} today!`);
      return;
    }
    const next = applyAnswer(session, challenge, result, Date.now());
    if (next === session) return; // time ran out at the buzzer — the ticker records it
    commit(next);
    setMessage(null);
    setPhase("reveal");
  };

  const typedInstantly = isTimerRunning(session); // resuming: no re-typing, timer keeps going

  return (
    <Shell
      ctx={ctx}
      footer={
        <span className="label">{streak > 0 ? `✦ ${streak}-DAY STREAK · ${trainer.name.toUpperCase()}` : "START A STREAK TODAY"}</span>
      }
    >
      {ctx.isDev && <div className="banner banner--dev">DEV MODE · SIMULATED DATE {ctx.date}</div>}

      <div className="hud">
        <div className="hud__left">
          <span className="label">DAILY #{challenge.number}</span>
          <span className="label hud__date">{formatDateLabel(ctx.date)} · UTC</span>
        </div>
        <div className="hud__score">
          <span className="label">SCORE</span>
          <span className="num">
            {String(totalScore(session) - (phase === "reveal" ? (lastRecord?.points ?? 0) : 0)).padStart(3, "0")}
          </span>
        </div>
      </div>

      {phase !== "results" && (
        <PartyBar
          answers={session.answers}
          current={phase === "question" ? qIndex : -1}
          hideFrom={phase === "reveal" ? session.answers.length - 1 : undefined}
        />
      )}

      {phase === "question" && question && (
        <section className="question" key={question.id}>
          <div className="question__meta">
            <span className="chip">{question.label}</span>
            <span className={`chip chip--${difficultyOf(question).id}`}>{difficultyOf(question).label}</span>
            <span className="label question__count">
              Q{qIndex + 1}/{challenge.questions.length} · {question.answers.length} VALID
            </span>
          </div>
          <QuestionTimer remaining={remaining} running={running} />
          <div className="dialog dialog--question" ref={shakeRef}>
            <Typewriter
              text={question.prompt}
              className="dialog__text dialog__text--big"
              instant={typedInstantly}
              onDone={onPromptShown}
            />
          </div>
          {question.description && <p className="question__scope">{question.description}</p>}
          <AnswerInput usedIds={usedIds} onSubmit={submit} disabled={!running} />
          <p className={`hint ${message ? "hint--error" : ""}`} role="status" aria-live="polite">
            {message ?? (running ? "Rarer correct answers earn better Poké Balls." : "Get ready…")}
          </p>
        </section>
      )}

      {phase === "reveal" && lastRecord && (
        <Reveal
          key={`${lastRecord.questionId}:${session.answers.length}`}
          record={lastRecord}
          species={lastRecord.speciesId != null ? getSpecies(lastRecord.speciesId)! : null}
          question={challenge.questions[session.answers.length - 1]}
          isLast={session.completed}
          onNext={() => {
            sfx.select();
            transitionTo(session.completed ? "results" : "question");
          }}
        />
      )}

      {phase === "results" && (
        <Results
          challenge={challenge}
          session={session}
          trainer={trainer}
          progress={progress}
          isDev={ctx.isDev}
          homeHref={appHref("/", ctx)}
        />
      )}

      <PixelWipe mode={wipe} />
      {ctx.isDev && (
        <DevPanel
          date={ctx.date}
          question={phase === "question" ? question : undefined}
          onReset={() => {
            ctx.store.reset();
            window.location.reload();
          }}
        />
      )}
    </Shell>
  );
}
