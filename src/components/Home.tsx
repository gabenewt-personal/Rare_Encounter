"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GAME_TITLE, QUESTIONS_PER_DAY } from "@/config/game";
import { appHref, readClientContext } from "@/lib/client";
import { dateKeyFor, formatDateLabel } from "@/lib/dates";
import { generateDailyChallenge } from "@/lib/questions";
import { activeStreak, trainerClassFor } from "@/lib/progress/streak";
import { loadOrCreateSession, persistSession, totalScore } from "@/lib/session";
import { sfx } from "@/lib/audio";
import { DevPanel } from "@/components/DevPanel";
import { PixelBall } from "@/components/PixelBall";
import { ResetInfo } from "@/components/ResetInfo";
import { Shell, useShell } from "@/components/Shell";
import { TrainerCard } from "@/components/TrainerCard";

function HomeBody({ ctx }: { ctx: ReturnType<typeof readClientContext> }) {
  const { openHelp, openSettings } = useShell();
  const [data] = useState(() => {
    const challenge = generateDailyChallenge(ctx.date);
    const session = loadOrCreateSession(ctx.store, challenge);
    // Heals a completed day whose progress write was interrupted (idempotent).
    const progress = persistSession(ctx.store, session);
    return { challenge, session, progress };
  });
  const { challenge, session, progress } = data;
  const trainer = trainerClassFor(activeStreak(progress, ctx.date));
  const done = session.completed;
  const started = session.answers.length > 0 || session.timer != null;
  const [stale, setStale] = useState(false);

  // Live mode: offer a refresh if the global day rolls over while open.
  useEffect(() => {
    if (ctx.isDev) return;
    const t = setInterval(() => setStale(dateKeyFor() !== ctx.date), 15_000);
    return () => clearInterval(t);
  }, [ctx]);

  return (
    <div className="home">
      {stale && (
        <button className="banner" onClick={() => window.location.reload()}>
          ★ A NEW DAILY CHALLENGE IS READY — TAP TO LOAD ★
        </button>
      )}
      {ctx.isDev && <div className="banner banner--dev">DEV MODE · SIMULATED DATE {ctx.date}</div>}

      <div className="home__title">
        <div className="home__balls" aria-hidden>
          <PixelBall tier="master" size={36} className="bob" />
          <PixelBall tier="ultra" size={36} className="bob bob--2" />
          <PixelBall tier="great" size={36} className="bob bob--3" />
          <PixelBall tier="poke" size={36} className="bob bob--4" />
        </div>
        <h1 className="home__logo">
          {GAME_TITLE.split(" ").map((w) => (
            <span key={w}>{w.toUpperCase()}</span>
          ))}
        </h1>
        <p className="home__tag">Name the Pokémon nobody else will.</p>
      </div>

      <section className="daily-card dialog" aria-labelledby="daily-title">
        <div className="daily-card__head">
          <h2 id="daily-title" className="daily-card__title">
            DAILY CHALLENGE <span className="num">#{challenge.number}</span>
          </h2>
          <span className="label daily-card__date">{formatDateLabel(ctx.date)} · UTC</span>
        </div>
        <div className="daily-card__status">
          <div className="daily-card__balls" aria-hidden>
            {challenge.questions.map((_, i) => {
              const a = session.answers[i];
              return <PixelBall key={i} size={22} tier={a ? (a.tier ?? "miss") : "empty"} />;
            })}
          </div>
          <span className="label">
            {done
              ? `COMPLETE · ${totalScore(session)} PTS`
              : started
                ? `IN PROGRESS · ${session.answers.length}/${QUESTIONS_PER_DAY}`
                : `${QUESTIONS_PER_DAY} PROMPTS · 20s EACH`}
          </span>
        </div>
        <Link
          href={appHref("/daily", ctx)}
          className={`btn btn--wide ${done ? "" : "btn--primary press-start"}`}
          onClick={() => sfx.select()}
        >
          {done ? "VIEW TODAY'S RESULTS" : started ? "▶ CONTINUE DAILY" : "▶ PLAY DAILY"}
        </Link>
        <ResetInfo isDev={ctx.isDev} />
      </section>

      <TrainerCard info={trainer} best={progress.bestStreak} />

      <button className="btn btn--wide btn--locked" disabled aria-describedby="survival-soon">
        SURVIVAL MODE <span id="survival-soon" className="chip chip--gold">COMING SOON</span>
      </button>

      <div className="home__links">
        <button className="btn" onClick={openHelp}>
          HOW TO PLAY
        </button>
        <button className="btn" onClick={openSettings}>
          SETTINGS
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [ctx] = useState(readClientContext);
  return (
    <Shell ctx={ctx} isHome footer={<span className="label">FAN-MADE · DATA FROM POKéAPI</span>}>
      <HomeBody ctx={ctx} />
      {ctx.isDev && <DevPanel date={ctx.date} onReset={() => (ctx.store.reset(), window.location.reload())} />}
    </Shell>
  );
}
