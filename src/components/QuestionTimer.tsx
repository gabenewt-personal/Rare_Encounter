import { QUESTION_TIME_LIMIT_SECONDS } from "@/config/game";
import { displaySeconds, isUrgent, QUESTION_TIME_LIMIT_MS } from "@/lib/timer";

/**
 * Pixel countdown: one segment per second plus a digital readout. Turns red and
 * pulses in the last few seconds (no pulse under reduced motion — colour and
 * the "HURRY!" label carry the urgency instead).
 */
export function QuestionTimer({ remaining, running }: { remaining: number; running: boolean }) {
  const secs = displaySeconds(remaining);
  const urgent = running && isUrgent(remaining);
  const segments = QUESTION_TIME_LIMIT_SECONDS;
  const lit = Math.ceil((remaining / QUESTION_TIME_LIMIT_MS) * segments);
  return (
    <div
      className={`timer ${urgent ? "timer--urgent" : ""} ${running ? "" : "timer--idle"}`}
      role="timer"
      aria-label={running ? `${secs} seconds left` : "Timer starts when the question is shown"}
    >
      <span className="timer__icon" aria-hidden>
        ⧗
      </span>
      <span className="timer__bar" aria-hidden>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={`timer__seg ${i < lit ? "is-on" : ""}`} />
        ))}
      </span>
      <span className="timer__num num" aria-hidden>
        {String(secs).padStart(2, "0")}
      </span>
      {/* Announce only the urgent phase, once, to avoid a chatty live region. */}
      <span className="sr-only" aria-live="assertive">
        {urgent && secs === 5 ? "5 seconds left" : ""}
      </span>
    </div>
  );
}
