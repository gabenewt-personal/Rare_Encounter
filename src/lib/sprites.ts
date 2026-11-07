/**
 * Sprite sources — swap artwork without touching gameplay.
 *
 * Choose with NEXT_PUBLIC_SPRITE_SET:
 *   "gen5"        (default) Black/White sprites for #1–649, PokéAPI default sprites after.
 *   "default"     PokéAPI `front_default` sprites for every species.
 *   "placeholder" No third-party art: an original pixel silhouette is drawn instead.
 *
 * All Pokémon sprites are © Nintendo / Creatures / GAME FREAK. They are hot-linked
 * from the PokéAPI sprites repository for this prototype only — see SPRITES.md
 * before any public release.
 */
const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

export type SpriteSet = "gen5" | "default" | "placeholder";

export const SPRITE_SET: SpriteSet = (() => {
  const v = process.env.NEXT_PUBLIC_SPRITE_SET;
  return v === "default" || v === "placeholder" ? v : "gen5";
})();

/**
 * @param id National Dex id, or a PokéAPI form id (≥10000) for regional forms.
 * @returns URL, or null when the placeholder should be drawn.
 */
export function spriteUrl(id: number, set: SpriteSet = SPRITE_SET): string | null {
  if (set === "placeholder") return null;
  if (set === "gen5" && id <= 649) return `${BASE}/versions/generation-v/black-white/${id}.png`;
  return `${BASE}/${id}.png`;
}
