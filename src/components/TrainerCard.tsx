import type { TrainerClassInfo } from "@/lib/progress/streak";

/** Trainer Class, streak and progress toward the next class. */
export function TrainerCard({ info, best, compact }: { info: TrainerClassInfo; best?: number; compact?: boolean }) {
  const segments = 10;
  const filled = Math.round(info.progress * segments);
  return (
    <section className={`trainer ${compact ? "trainer--compact" : ""}`} aria-label="Trainer card">
      <div className="trainer__row">
        <div>
          <div className="label">TRAINER CLASS</div>
          <div className="trainer__class">{info.name.toUpperCase()}</div>
        </div>
        <div className="trainer__streak" aria-label={`${info.streak} day streak`}>
          <span className="trainer__flame" aria-hidden>
            ✦
          </span>
          <span className="num">{info.streak}</span>
          <span className="label">DAY{info.streak === 1 ? "" : "S"}</span>
        </div>
      </div>
      {info.next ? (
        <>
          <div
            className="meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={info.next.minStreak}
            aria-valuenow={info.streak}
            aria-label={`Progress to ${info.next.name}`}
          >
            {Array.from({ length: segments }, (_, i) => (
              <span key={i} className={`meter__seg ${i < filled ? "is-on" : ""}`} />
            ))}
          </div>
          <div className="trainer__next label">
            NEXT: {info.next.name.toUpperCase()} IN {info.daysToNext} DAY{info.daysToNext === 1 ? "" : "S"}
            {best ? <span className="trainer__best"> · BEST {best}</span> : null}
          </div>
        </>
      ) : (
        <div className="trainer__next label">TOP RANK REACHED · BEST {best ?? info.streak}</div>
      )}
    </section>
  );
}
