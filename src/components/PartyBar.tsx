import { TEAM_SIZE } from "@/config/game";
import { getSpecies } from "@/lib/pokedex";
import { outcomeOf, type AnswerRecord } from "@/lib/session";
import { PixelBall } from "@/components/PixelBall";
import { Sprite } from "@/components/Sprite";

/**
 * Six-slot party indicator. Each answer fills a slot with its sprite and Poké
 * Ball; misses show a faded sprite, timeouts an hourglass, and the current
 * slot blinks.
 */
export function PartyBar({
  answers,
  current,
  hideFrom,
}: {
  answers: AnswerRecord[];
  /** Index of the prompt being played (highlighted), or -1. */
  current: number;
  /** Slots at or after this index render empty (e.g. the answer still being revealed). */
  hideFrom?: number;
}) {
  const filled = answers.filter((a, i) => (hideFrom == null || i < hideFrom) && a.correct).length;
  return (
    <ol className="party" aria-label={`Party: ${filled} of ${TEAM_SIZE} Pokémon`}>
      {Array.from({ length: TEAM_SIZE }, (_, i) => {
        const a = hideFrom != null && i >= hideFrom ? undefined : answers[i];
        const out = a ? outcomeOf(a) : null;
        const sp = a?.speciesId != null ? getSpecies(a.speciesId) : undefined;
        return (
          <li key={i} className={`party__slot ${i === current ? "is-current" : ""} ${out ? `is-${out}` : ""}`}>
            {sp ? (
              <span className="party__sprite">
                <Sprite id={a!.formId ?? sp.id} name={sp.name} size={56} />
              </span>
            ) : out === "timeout" ? (
              <span className="party__icon" aria-label="Timed out">
                ⧗
              </span>
            ) : (
              <PixelBall tier="empty" size={18} />
            )}
            {a && <PixelBall tier={a.tier ?? "miss"} size={12} className="party__ball" />}
            {out === "incorrect" && (
              <span className="party__x" aria-hidden>
                ✕
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
