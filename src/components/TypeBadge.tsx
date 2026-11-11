import type { PokemonType } from "@/data/types";

const ABBR: Record<PokemonType, string> = {
  normal: "NRM", fire: "FIR", water: "WTR", grass: "GRS", electric: "ELC", ice: "ICE",
  fighting: "FGT", poison: "PSN", ground: "GRD", flying: "FLY", psychic: "PSY", bug: "BUG",
  rock: "RCK", ghost: "GHO", dragon: "DRG", dark: "DRK", steel: "STL", fairy: "FRY",
};

/** Pixel type chip in a muted, palette-friendly colour. */
export function TypeBadge({ type, short = false }: { type: PokemonType; short?: boolean }) {
  return (
    <span className={`type type--${type}`} title={type[0].toUpperCase() + type.slice(1)}>
      {short ? ABBR[type] : type.toUpperCase()}
    </span>
  );
}
