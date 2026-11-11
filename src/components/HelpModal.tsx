"use client";
import { useEffect, useRef } from "react";
import { QUESTION_TIME_LIMIT_SECONDS, RESET_TIMEZONE_LABEL, TEAM_SYNERGY, TIERS, TRAINER_CLASSES } from "@/config/game";
import { PixelBall } from "@/components/PixelBall";

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="help-title">
      <div className="modal__inner dialog">
        <h2 id="help-title" className="modal__title">HOW TO PLAY</h2>
        <p>
          Every day, all trainers get the same <strong>6 prompts</strong>. Answer each with one Pokémon — the{" "}
          <strong>rarer</strong> your correct answer, the more points you earn. Your six answers form a{" "}
          <strong>party</strong>.
        </p>
        <ul className="modal__list">
          <li>Prompts go 2 easy → 3 medium → 1 hard.</li>
          <li>
            You have <strong>{QUESTION_TIME_LIMIT_SECONDS} seconds</strong> per prompt, starting once it&apos;s fully shown. The clock keeps
            running if you leave or reload. Running out scores 0. There&apos;s no speed bonus.
          </li>
          <li>Each species can only be used once per day.</li>
          <li>Misspelled or unknown names don&apos;t cost a turn (the timer keeps going). A real Pokémon that doesn&apos;t fit does.</li>
          <li>
            A new challenge unlocks for everyone at <strong>00:00 {RESET_TIMEZONE_LABEL}</strong> (shown in your local time on the home
            screen).
          </li>
        </ul>

        <h3 className="modal__sub">RARITY</h3>
        <table className="modal__table">
          <tbody>
            {TIERS.map((t, i) => {
              const upper = i === 0 ? null : TIERS[i - 1].minShare;
              const range = upper == null ? `≥ ${t.minShare * 100}%` : t.minShare === 0 ? `< ${upper * 100}%` : `${t.minShare * 100}–${upper * 100}%`;
              return (
                <tr key={t.id}>
                  <td><PixelBall tier={t.id} size={20} /></td>
                  <td>{t.label}</td>
                  <td>{range}</td>
                  <td className="num">{t.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fineprint">
          Percentages are the <strong>estimated</strong> share of trainers who&apos;d give that answer <em>to that prompt</em>. They come
          from a model, not real submissions: general familiarity (generation, starters, legendaries, fan favourites) adjusted per
          prompt. Textbook fits rank higher (Electric types that learn Thunderbolt by level-up), and deep cuts rank lower (TM-only
          learners, hidden abilities, regional forms). They&apos;re fixed for the whole day.
        </p>

        <h3 className="modal__sub">TEAM SYNERGY</h3>
        <p>
          After prompt six, your party&apos;s defensive typing is checked against all 18 attacking types (modern type chart; dual
          types, 4× weaknesses and immunities count; abilities, items and moves don&apos;t). Types that hit several teammates
          super-effectively — and that too few teammates resist — add <em>exposure</em>. Low exposure multiplies your rarity
          score:
        </p>
        <table className="modal__table">
          <tbody>
            {TEAM_SYNERGY.tiers.map((t, i) => {
              const lo = i === 0 ? 0 : TEAM_SYNERGY.tiers[i - 1].maxExposure + 1;
              const range = t.maxExposure === Infinity ? `${lo}+` : lo === t.maxExposure ? `${lo}` : `${lo}–${t.maxExposure}`;
              return (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>exposure {range}</td>
                  <td className="num">×{t.multiplier.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fineprint">
          The bonus needs six valid, distinct Pokémon — any miss or timeout keeps your plain rarity score. Rarity is always the
          main source of points.
        </p>

        <h3 className="modal__sub">ANSWER RULES</h3>
        <ul className="modal__list">
          <li><strong>Types</strong> use current typing. A species counts if its standard form <em>or</em> a regional form (Alolan, Galarian, Hisuian, Paldean) fits. Megas, Gigantamax and other alternate forms don&apos;t count.</li>
          <li><strong>Generation</strong> means when the species debuted (Alolan Vulpix is still Gen I).</li>
          <li><strong>Moves</strong> count if learnable by any method (level-up, TM/HM/TR, egg, tutor) in any main-series game.</li>
          <li><strong>Abilities</strong> include hidden abilities.</li>
          <li><strong>Evolution</strong> prompts mean the Pokémon that evolves (Clefairy uses a Moon Stone).</li>
          <li><strong>Name</strong> prompts use the official English name, ignoring accents (Flabébé starts with F).</li>
          <li><strong>Base stats, height and weight</strong> use each species&apos; standard form. <strong>Matchups</strong> go by typing alone (abilities like Levitate don&apos;t count).</li>
          <li><strong>Locations</strong> use recorded wild encounters from the main-series games (mostly Gen I–VII).</li>
          <li><strong>Wildcards</strong> (&quot;based on a cat&quot;) use a hand-reviewed list. Visual ones are judged from official artwork, not the Pokédex color.</li>
          <li>The small print under each prompt explains its exact rules.</li>
        </ul>

        <h3 className="modal__sub">TRAINER CLASS</h3>
        <p>Finish the daily challenge on consecutive days to rank up:</p>
        <p className="modal__classes">
          {TRAINER_CLASSES.map((c) => `${c.name} (${c.minStreak})`).join(" · ")}
        </p>

        <button className="btn btn--primary btn--wide" onClick={onClose}>
          OK!
        </button>
        <p className="fineprint">
          Fan-made, non-commercial prototype. Pokémon and Pokémon character names are trademarks of Nintendo, Creatures Inc. and
          GAME FREAK. Data from PokéAPI.
        </p>
      </div>
    </dialog>
  );
}
