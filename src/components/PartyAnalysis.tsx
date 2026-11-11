import { TEAM_SIZE, TEAM_SYNERGY } from "@/config/game";
import { getSpecies } from "@/lib/pokedex";
import type { ScoreSummary } from "@/lib/session";
import type { TypeMatchup } from "@/lib/synergy";
import { Sprite } from "@/components/Sprite";
import { TypeBadge } from "@/components/TypeBadge";

function describe(m: TypeMatchup) {
  const parts = [`${m.weakMembers} weak${m.quadMembers ? ` (${m.quadMembers}× 4×)` : ""}`];
  const covered = m.resistMembers + m.immuneMembers;
  parts.push(covered ? `${covered} resist${m.immuneMembers ? `/immune` : ""}` : "no cover");
  return parts.join(" · ");
}

/** Retro party-analysis panel: the six members, their types, and the defensive read-out. */
export function PartyAnalysis({ summary }: { summary: ScoreSummary }) {
  const { team, synergy } = summary;
  const threats = synergy?.vulnerabilities.slice(0, 3) ?? [];
  const walls = synergy?.strengths.slice(0, 4) ?? [];

  return (
    <section className="analysis" aria-labelledby="analysis-title">
      <h2 id="analysis-title" className="analysis__title">
        PARTY ANALYSIS
      </h2>

      <ol className="analysis__party">
        {Array.from({ length: TEAM_SIZE }, (_, i) => {
          const m = team[i];
          const sp = m ? getSpecies(m.speciesId) : undefined;
          return (
            <li key={i} className={`member ${m ? "" : "member--empty"}`}>
              {sp && m ? (
                <>
                  <span className="member__sprite">
                    <Sprite id={m.formId ?? sp.id} name={sp.name} size={64} />
                  </span>
                  <span className="member__name">{sp.name}</span>
                  <span className="member__types">
                    {m.types.map((t) => (
                      <TypeBadge key={t} type={t} short />
                    ))}
                  </span>
                </>
              ) : (
                <span className="member__none label">EMPTY</span>
              )}
            </li>
          );
        })}
      </ol>

      {synergy ? (
        <>
          <div className={`synergy synergy--${synergy.tier.id}`}>
            <div>
              <div className="label">TEAM SYNERGY</div>
              <div className="synergy__tier">{synergy.tier.label.toUpperCase()}</div>
            </div>
            <div className="synergy__mult num">×{synergy.tier.multiplier.toFixed(2)}</div>
            <div className="synergy__exposure label">EXPOSURE {synergy.exposure}</div>
          </div>

          <div className="defense" aria-label="Defensive matchups against all 18 attacking types">
            {synergy.matchups.map((m) => {
              const net = m.weak - m.resistMembers - m.immuneMembers;
              const level = net >= 3 ? "w3" : net === 2 ? "w2" : net === 1 ? "w1" : net === 0 ? "n" : net >= -2 ? "r1" : "r2";
              return (
                <span key={m.attacker} className={`defense__cell defense--${level} ${m.exposure ? "is-exposed" : ""}`} title={`${m.attacker}: ${describe(m)}`}>
                  <TypeBadge type={m.attacker} short />
                  <span className="defense__net num">{net > 0 ? `+${net}` : net}</span>
                </span>
              );
            })}
          </div>
          <p className="fineprint defense__legend">
            Net weak teammates per attacking type (− = resisted). Exposure counts types where weaknesses outnumber cover by more
            than {TEAM_SYNERGY.overlapAllowance}; a 4× weakness counts {TEAM_SYNERGY.quadWeaknessWeight === 2 ? "double" : `×${TEAM_SYNERGY.quadWeaknessWeight}`}.
          </p>

          <div className="threats">
            <div className="label">{threats.length ? "BIGGEST THREATS" : "NO SHARED WEAKNESSES!"}</div>
            {threats.map((m) => (
              <div key={m.attacker} className="threats__row">
                <TypeBadge type={m.attacker} />
                <span className="threats__desc">{describe(m)}</span>
              </div>
            ))}
            {walls.length > 0 && (
              <div className="threats__walls">
                <span className="label">WALLS</span>
                {walls.map((m) => (
                  <TypeBadge key={m.attacker} type={m.attacker} short />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="synergy synergy--none">
          No Team Synergy bonus — it needs {TEAM_SIZE} valid, distinct Pokémon. Your rarity score stands as-is.
        </p>
      )}
    </section>
  );
}
