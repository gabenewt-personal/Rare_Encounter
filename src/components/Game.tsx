"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_TITLE, QUESTIONS_PER_DAY } from "@/config/game";
import { dateKeyFor, formatDateLabel, isDateKey } from "@/lib/dates";
import { generateDailyChallenge, difficultyOf } from "@/lib/questions";
import { LocalStorageStore, type GameStore } from "@/lib/progress/store";
import { activeStreak, trainerClassFor, type PlayerProgress } from "@/lib/progress/streak";
import { applyAnswer, loadOrCreateSession, persistSession, totalScore, type DailySession } from "@/lib/session";
import { validateAnswer } from "@/lib/validation";
import { getSpecies } from "@/lib/pokedex";
import { setSoundEnabled, sfx } from "@/lib/audio";
import { AnswerInput } from "@/components/AnswerInput";
import { DevPanel } from "@/components/DevPanel";
import { HelpModal } from "@/components/HelpModal";
import { PixelBall } from "@/components/PixelBall";
import { PixelWipe } from "@/components/PixelWipe";
import { Results } from "@/components/Results";
import { Reveal } from "@/components/Reveal";
import { TrainerCard } from "@/components/TrainerCard";
import { Typewriter } from "@/components/Typewriter";

type Phase = "title" | "question" | "reveal" | "results";

// Spelled out: the pixel body font's 5 and S look alike.
const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

function initGame() {
  const params = new URLSearchParams(window.location.search);
  const isDev = params.get("dev") === "1";
  const requested = params.get("date");
  const date = isDev && isDateKey(requested) ? requested : dateKeyFor();
  const store: GameStore = new LocalStorageStore(isDev ? "dev" : "live");
  const challenge = generateDailyChallenge(date);
  const session = loadOrCreateSession(store, challenge);
  // Heals a completed session whose progress write was interrupted (idempotent).
  const progress = persistSession(store, session);
  const sound = store.getSetting("sound", false);
  setSoundEnabled(sound);
  return { isDev, date, store, challenge, session, progress, sound };
}

export default function Game() {
  const [init] = useState(initGame);
  const { isDev, date, store, challenge } = init;
  const [session, setSession] = useState<DailySession>(init.session);
  const [progress, setProgress] = useState<PlayerProgress>(init.progress);
  const [phase, setPhase] = useState<Phase>(init.session.completed ? "results" : "title");
  const [wipe, setWipe] = useState<"in" | "out" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sound, setSound] = useState(init.sound);
  const [help, setHelp] = useState(false);
  const [stale, setStale] = useState(false);
  const shakeRef = useRef<HTMLDivElement>(null);

  // Live mode: notice when the global day rolls over while the tab is open.
  useEffect(() => {
    if (isDev) return;
    const t = setInterval(() => setStale(dateKeyFor() !== date), 15_000);
    return () => clearInterval(t);
  }, [isDev, date]);

  const streak = activeStreak(progress, date);
  const trainer = trainerClassFor(streak);
  const qIndex = phase === "reveal" ? session.answers.length - 1 : session.answers.length;
  const question = challenge.questions[Math.min(qIndex, challenge.questions.length - 1)];
  const usedIds = useMemo(() => new Set(session.answers.map((a) => a.speciesId)), [session.answers]);
  const lastRecord = session.answers[session.answers.length - 1];

  const transitionTo = (next: Phase) => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setPhase(next);
    setWipe("in");
    setTimeout(() => {
      setPhase(next);
      setWipe("out");
      setTimeout(() => setWipe(null), 420);
    }, 420);
  };

  const shake = () => {
    const el = shakeRef.current;
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  };

  const submit = (input: string) => {
    if (phase !== "question" || session.completed) return;
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
    const next = applyAnswer(session, challenge, result);
    // Persist before any animation so a reload can't replay this turn.
    const nextProgress = persistSession(store, next);
    setSession(next);
    setProgress(nextProgress);
    setMessage(null);
    setPhase("reveal");
  };

  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    setSoundEnabled(on);
    store.setSetting("sound", on);
    if (on) sfx.select();
  };

  const resetDev = () => {
    store.reset();
    window.location.reload();
  };

  return (
    <div className="console">
      <header className="shell-top">
        <h1 className="logo">
          <PixelBall tier="poke" size={18} />
          <span>{GAME_TITLE.toUpperCase()}</span>
        </h1>
        <div className="shell-top__actions">
          <button className="icon-btn" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Mute sound" : "Turn sound on"}>
            {sound ? "♪ ON" : "♪ OFF"}
          </button>
          <button className="icon-btn" onClick={() => setHelp(true)} aria-label="How to play">
            ?
          </button>
        </div>
      </header>

      <main className="screen">
        {stale && (
          <button className="banner" onClick={() => window.location.reload()}>
            ★ A NEW DAILY CHALLENGE IS READY — TAP TO LOAD ★
          </button>
        )}
        {isDev && <div className="banner banner--dev">DEV MODE · SIMULATED DATE {date}</div>}

        <div className="hud">
          <div className="hud__left">
            <span className="label">DAILY #{challenge.number}</span>
            <span className="label hud__date">{formatDateLabel(date)}</span>
          </div>
          <div className="hud__balls" aria-label="Answers so far">
            {challenge.questions.map((_, i) => {
              const a = session.answers[i];
              const showResult = a && !(phase === "reveal" && i === session.answers.length - 1);
              return (
                <PixelBall
                  key={i}
                  tier={showResult ? (a.tier ?? "miss") : "empty"}
                  size={20}
                  className={i === qIndex && phase !== "results" ? "hud__current" : ""}
                />
              );
            })}
          </div>
          <div className="hud__score">
            <span className="label">SCORE</span>
            <span className="num">{String(totalScore(session) - (phase === "reveal" ? (lastRecord?.points ?? 0) : 0)).padStart(3, "0")}</span>
          </div>
        </div>

        {phase === "title" && (
          <section className="title-screen">
            <div className="title-screen__art" aria-hidden>
              <PixelBall tier="master" size={44} className="bob" />
              <PixelBall tier="ultra" size={44} className="bob bob--2" />
              <PixelBall tier="great" size={44} className="bob bob--3" />
              <PixelBall tier="poke" size={44} className="bob bob--4" />
            </div>
            <div className="dialog">
              <Typewriter
                text={
                  session.answers.length
                    ? `Welcome back! ${NUMBER_WORDS[session.answers.length]} down, ${NUMBER_WORDS[QUESTIONS_PER_DAY - session.answers.length].toLowerCase()} to go. Rare answers are worth more!`
                    : `${NUMBER_WORDS[QUESTIONS_PER_DAY]} prompts. One Pokémon each. The rarer your correct answer, the bigger the score!`
                }
                className="dialog__text"
              />
            </div>
            <TrainerCard info={trainer} best={progress.bestStreak} />
            <button
              className="btn btn--primary btn--wide press-start"
              onClick={() => {
                sfx.select();
                transitionTo("question");
              }}
            >
              {session.answers.length ? "▶ CONTINUE" : "▶ PRESS START"}
            </button>
            <button className="link-btn" onClick={() => setHelp(true)}>
              HOW TO PLAY
            </button>
          </section>
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
            <div className="dialog dialog--question" ref={shakeRef}>
              <Typewriter text={question.prompt} className="dialog__text dialog__text--big" />
            </div>
            <AnswerInput usedIds={usedIds} onSubmit={submit} />
            <p className={`hint ${message ? "hint--error" : ""}`} role="status" aria-live="polite">
              {message ?? "Rarer correct answers earn better Poké Balls."}
            </p>
          </section>
        )}

        {phase === "reveal" && lastRecord && (
          <Reveal
            key={lastRecord.questionId}
            record={lastRecord}
            species={getSpecies(lastRecord.speciesId)!}
            question={challenge.questions[session.answers.length - 1]}
            isLast={session.completed}
            onNext={() => {
              sfx.select();
              transitionTo(session.completed ? "results" : "question");
            }}
          />
        )}

        {phase === "results" && (
          <Results challenge={challenge} session={session} trainer={trainer} progress={progress} isDev={isDev} />
        )}

        <PixelWipe mode={wipe} />
      </main>

      <footer className="shell-bottom">
        <span className="label">
          {streak > 0 ? `✦ ${streak}-DAY STREAK · ${trainer.name.toUpperCase()}` : "START A STREAK TODAY"}
        </span>
      </footer>

      {isDev && <DevPanel date={date} question={phase === "question" ? question : undefined} onReset={resetDev} />}
      <HelpModal open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
